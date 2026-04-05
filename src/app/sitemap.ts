import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://rsl-tools.xyz";
  const locales = ["en", "ko"];
  const pages = ["", "/clan-boss", "/shard", "/search", "/dashboard"];
  const lastModified = new Date();

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const page of pages) {
      entries.push({
        url: `${baseUrl}/${locale}${page}`,
        lastModified,
        changeFrequency: page === "" ? "weekly" : "monthly",
        priority: page === "" ? 1.0 : page === "/clan-boss" ? 0.9 : 0.7,
      });
    }
  }

  return entries;
}
