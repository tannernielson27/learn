import { expect, type Page } from "@playwright/test";
import { RENDERER_LOADING } from "../src/components/question/RendererLoading";

/**
 * Resolves once no question on the page is still waiting for its renderer's chunk (#54). A step
 * change or a new live item can bring a type whose chunk has not loaded yet, and until it arrives
 * the question is a placeholder with no controls in it, so counting controls finds none. Call it
 * after anything that puts a new item on the page and before counting or reading its controls.
 */
export async function questionShown(page: Page): Promise<void> {
  await expect(page.getByText(RENDERER_LOADING, { exact: true })).toHaveCount(0);
}
