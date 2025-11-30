import { NextResponse } from "next/server";
import { parseAndValidateMRZ } from "../../../lib/mrz.js";
import { decodeBarcodesFromImage } from "../../../lib/barcode.js";
import { ocrImage } from "../../../lib/ocr.js";
import { evaluateEligibility, computeOverallConfidence, buildSummary } from "../../../lib/verify.js";
import { z } from "zod";

export const maxDuration = 60;

const InputSchema = z.object({
  images: z.array(z.object({ url: z.string().url().optional(), base64: z.string().optional() })).min(1),
  applicant: z.object({
    name: z.string().min(1),
    dob: z.string().min(4),
    passportNumber: z.string().min(3).optional(),
    nationality: z.string().min(2).optional(),
    intendedVisaType: z.string().min(2).optional()
  }),
  policy: z
    .object({
      minPassportValidityMonths: z.number().int().min(0).default(6),
      minApplicantAgeYears: z.number().int().min(0).default(18),
      allowedNationalities: z.array(z.string()).default([]),
      disallowedNationalities: z.array(z.string()).default([]),
      allowedVisaTypes: z.array(z.string()).default([]),
      disallowedVisaTypes: z.array(z.string()).default([]),
      requireMRZChecksumPass: z.boolean().default(true)
    })
    .optional()
});

export async function POST(req) {
  try {
    const body = await req.json();
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request",
          issues: parsed.error.issues
        },
        { status: 400 }
      );
    }
    const { images, applicant, policy } = parsed.data;

    const extractionResults = [];
    for (const img of images) {
      const source = img.base64 || img.url;
      const [ocr, barcodes] = await Promise.all([
        ocrImage(source),
        decodeBarcodesFromImage(source).catch(() => [])
      ]);
      const mrz = parseAndValidateMRZ(ocr.rawText);
      extractionResults.push({ ocr, mrz, barcodes });
    }

    // Merge fields from multiple images with simple heuristic by confidence
    const aggregated = aggregateExtractions(extractionResults);

    const checks = [];
    if (aggregated.mrz && aggregated.mrz.checks) {
      for (const c of aggregated.mrz.checks) checks.push(c);
    }

    const eligibility = evaluateEligibility(aggregated, applicant, policy || {});
    for (const c of eligibility.checks) checks.push(c);

    const overallConfidence = computeOverallConfidence(aggregated);
    const summary = buildSummary(aggregated, applicant, eligibility, checks, overallConfidence);

    const response = {
      ok: true,
      overallConfidence,
      extracted: {
        documentType: aggregated.documentType,
        issuingCountry: aggregated.issuingCountry,
        surname: aggregated.surname,
        givenNames: aggregated.givenNames,
        fullName: aggregated.fullName,
        documentNumber: aggregated.documentNumber,
        nationality: aggregated.nationality,
        dateOfBirth: aggregated.dateOfBirth,
        sex: aggregated.sex,
        dateOfExpiry: aggregated.dateOfExpiry,
        mrz: aggregated.mrz?.raw || null,
        barcodes: aggregated.barcodes || [],
        text: aggregated.textLines || []
      },
      validations: checks,
      eligibility: {
        eligible: eligibility.eligible,
        reasons: eligibility.reasons,
        recommendedNextActions: eligibility.nextActions
      },
      summary
    };

    return NextResponse.json(response);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message || e)
      },
      { status: 500 }
    );
  }
}

function pickBest(values) {
  return values
    .filter(Boolean)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
}

function aggregateExtractions(results) {
  const fields = {
    documentType: [],
    issuingCountry: [],
    surname: [],
    givenNames: [],
    fullName: [],
    documentNumber: [],
    nationality: [],
    dateOfBirth: [],
    sex: [],
    dateOfExpiry: []
  };
  const textLines = [];
  const barcodes = [];
  let mrzRaw = null;
  let mrzChecks = [];

  for (const r of results) {
    if (r.ocr?.lines) {
      for (const l of r.ocr.lines) {
        textLines.push({ text: l.text, confidence: l.confidence });
      }
    }
    if (r.barcodes?.length) {
      for (const b of r.barcodes) barcodes.push(b);
    }
    if (r.mrz?.fields) {
      mrzRaw = r.mrz.raw || mrzRaw;
      mrzChecks = r.mrz.checks || mrzChecks;
      for (const [k, v] of Object.entries(r.mrz.fields)) {
        if (fields[k]) fields[k].push(v);
      }
    }
  }

  const aggregated = Object.fromEntries(
    Object.entries(fields).map(([k, arr]) => {
      const best = pickBest(arr);
      return [k, best ? best.value : null];
    })
  );

  // Build full name if not provided
  aggregated.fullName =
    aggregated.fullName ||
    [aggregated.surname, aggregated.givenNames].filter(Boolean).join(" ").trim() ||
    null;

  const allText = textLines.map((l) => l.text);
  return {
    ...aggregated,
    mrz: mrzRaw ? { raw: mrzRaw, checks: mrzChecks } : null,
    barcodes,
    textLines: textLines,
    documentType: aggregated.documentType,
    issuingCountry: aggregated.issuingCountry
  };
}

