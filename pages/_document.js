import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#241521" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
