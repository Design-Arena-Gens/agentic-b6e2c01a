export const metadata = {
  title: "AI Document Verifier",
  description: "OCR + MRZ/Barcode verification and eligibility assessment"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, system-ui, Arial, sans-serif", margin: 0, padding: 0, background: "#0b1220", color: "#e7ecf2" }}>
        {children}
      </body>
    </html>
  );
}

