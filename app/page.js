"use client";
import { useState } from "react";

export default function HomePage() {
  const [images, setImages] = useState([]);
  const [form, setForm] = useState({
    name: "",
    dob: "",
    passportNumber: "",
    nationality: "",
    intendedVisaType: "tourist"
  });
  const [policy, setPolicy] = useState({
    minPassportValidityMonths: 6,
    minApplicantAgeYears: 18,
    allowedNationalities: [],
    disallowedNationalities: [],
    allowedVisaTypes: ["tourist", "business", "student"],
    disallowedVisaTypes: [],
    requireMRZChecksumPass: true
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    const readers = await Promise.all(
      files.map(
        (f) =>
          new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.readAsDataURL(f);
          })
      )
    );
    setImages(readers);
  };

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((dataUrl) => ({ base64: dataUrl })),
          applicant: form,
          policy
        })
      });
      const json = await res.json();
      setResult(json);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>AI Document Verifier</h1>
      <p style={{ color: "#a6b0c3", marginBottom: 24 }}>
        Upload passport/ID images and provide applicant details. The API returns a structured JSON assessment.
      </p>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#121a2b", padding: 16, borderRadius: 12 }}>
          <h3>Images</h3>
          <input type="file" multiple accept="image/*" onChange={onFiles} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {images.map((src, i) => (
              <img key={i} src={src} alt={`upload-${i}`} style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #24314d" }} />
            ))}
          </div>
        </div>
        <div style={{ background: "#121a2b", padding: 16, borderRadius: 12 }}>
          <h3>Applicant</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Surname Given" /></label>
            <label>DOB (YYYY-MM-DD)<input value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} placeholder="1990-01-31" /></label>
            <label>Passport No.<input value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} placeholder="123456789" /></label>
            <label>Nationality<input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value.toUpperCase() })} placeholder="USA" /></label>
            <label>Visa Type<select value={form.intendedVisaType} onChange={(e) => setForm({ ...form, intendedVisaType: e.target.value })}>
              <option value="tourist">tourist</option>
              <option value="business">business</option>
              <option value="student">student</option>
              <option value="work">work</option>
            </select></label>
          </div>
        </div>
      </section>

      <section style={{ background: "#121a2b", padding: 16, borderRadius: 12, marginBottom: 24 }}>
        <h3>Eligibility Policy (optional)</h3>
        <small style={{ color: "#8ea2c5" }}>JSON editable</small>
        <textarea
          value={JSON.stringify(policy, null, 2)}
          onChange={(e) => {
            try {
              setPolicy(JSON.parse(e.target.value));
            } catch {}
          }}
          rows={12}
          style={{ width: "100%", background: "#0b1220", color: "white", borderRadius: 8, border: "1px solid #24314d", padding: 8 }}
        />
      </section>

      <button onClick={run} disabled={busy || images.length === 0} style={{ background: "#4e9dff", color: "black", padding: "10px 16px", borderRadius: 8, border: 0, fontWeight: 700 }}>
        {busy ? "Running..." : "Verify"}
      </button>

      <section style={{ background: "#121a2b", padding: 16, borderRadius: 12, marginTop: 24 }}>
        <h3>Result</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>{result ? JSON.stringify(result, null, 2) : "No result yet."}</pre>
      </section>
    </main>
  );
}

