import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Outside a Next build, `next/dynamic` resolves to the Pages Router loader, which renders its own
// placeholder without suspending and catches a failed load. Next aliases it to this module in the
// App Router (see createAppRouterApiAliases in next/dist/build/create-compiler-aliases.js):
// `React.lazy`, which suspends to the nearest Suspense boundary and throws a failed load to the
// nearest error boundary. The question renderers rely on both (#54), so tests use what the app ships.
vi.mock("next/dynamic", async () => {
  const appDynamic: { default?: unknown } = await import("next/dist/shared/lib/app-dynamic");
  return { default: appDynamic.default ?? appDynamic };
});
