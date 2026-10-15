import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
