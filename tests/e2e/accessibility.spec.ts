import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("public entry points meet automated WCAG 2 AA checks", async ({
  page,
}) => {
  for (const path of ["/", "/admin", "/marlene", "/present"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
