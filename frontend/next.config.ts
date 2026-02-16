import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

const getAssetsRemotePattern = (): RemotePattern | null => {
  const baseUrl = process.env.NEXT_PUBLIC_ASSETS_BASE_URL;
  if (!baseUrl) return null;

  try {
    const parsed = new URL(baseUrl);
    const protocol = parsed.protocol.replace(":", "") as RemotePattern["protocol"];
    const pathname = parsed.pathname.replace(/\/$/, "");
    return {
      protocol,
      hostname: parsed.hostname,
      ...(parsed.port ? { port: parsed.port } : {}),
      pathname: `${pathname || ""}/**`,
    };
  } catch {
    return null;
  }
};

const assetsPattern = getAssetsRemotePattern();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: assetsPattern ? [assetsPattern] : [],
    dangerouslyAllowSVG: true,
  },
};

export default nextConfig;
