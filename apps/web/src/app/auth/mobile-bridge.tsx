"use client";

import { useEffect, useMemo } from "react";

function buildAppRedirectUrl(pathname: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const sourceUrl = new URL(window.location.href);
  const appUrl = new URL(`cleansea://${pathname}`);

  sourceUrl.searchParams.forEach((value, key) => {
    appUrl.searchParams.set(key, value);
  });

  const hash = sourceUrl.hash.startsWith("#")
    ? sourceUrl.hash.slice(1)
    : sourceUrl.hash;

  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      appUrl.searchParams.set(key, value);
    });
  }

  return appUrl.toString();
}

type Props = {
  appPathname: string;
  title: string;
  text: string;
  buttonText: string;
};

export function MobileRedirectPage({
  appPathname,
  title,
  text,
  buttonText
}: Props) {
  const appRedirectUrl = useMemo(
    () => buildAppRedirectUrl(appPathname),
    [appPathname]
  );

  useEffect(() => {
    if (!appRedirectUrl) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.location.replace(appRedirectUrl);
    }, 150);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [appRedirectUrl]);

  return (
    <main style={{ maxWidth: 480, margin: "48px auto", padding: "0 16px" }}>
      <h1>{title}</h1>
      <p>{text}</p>
      {appRedirectUrl ? (
        <p>
          <a href={appRedirectUrl}>{buttonText}</a>
        </p>
      ) : null}
    </main>
  );
}
