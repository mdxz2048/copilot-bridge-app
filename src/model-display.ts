export function displayModel(id: string): string {
  if (!id) return "";
  const slug = id.includes("/") ? id.split("/").at(-1)! : id;
  if (slug.startsWith("gpt-")) {
    const suffix = slug.slice(4).replace(/-/g, " ");
    return `GPT-${titleCase(suffix)}`;
  }
  return titleCase(slug.replace(/-/g, " "));
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
