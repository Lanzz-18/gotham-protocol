// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import { Roll } from "../../src/ui/Roll";

afterEach(cleanup);

describe("Rolling numbers", () => {
  it("renders plain text at rest", () => {
    const { container } = render(<Roll value={42} />);
    expect(container.textContent).toBe("42");
    expect(container.querySelector(".roll")).toBeNull();
  });

  it("rolls when the value changes, labelled with the new value", () => {
    const { container, rerender } = render(<Roll value={9} />);
    rerender(<Roll value={10} />);
    const roll = container.querySelector(".roll");
    expect(roll?.getAttribute("aria-label")).toBe("10");
    expect(container.querySelectorAll(".roll-col")).toHaveLength(2);
  });

  it("settles back to plain text once the roll is done", async () => {
    const { container, rerender } = render(<Roll value={1} />);
    rerender(<Roll value={2} />);
    await act(() => new Promise((r) => setTimeout(r, 800)));
    expect(container.textContent).toBe("2");
    expect(container.querySelector(".roll")).toBeNull();
  });

  it("keeps formatting characters still, and only rolls digits", () => {
    const { container, rerender } = render(<Roll value={999} format={(n) => n.toLocaleString("en-US")} />);
    rerender(<Roll value={1000} format={(n) => n.toLocaleString("en-US")} />);
    expect(container.querySelector(".roll")?.getAttribute("aria-label")).toBe("1,000");
    expect(container.querySelectorAll(".roll-col")).toHaveLength(4);
    expect(container.querySelector(".roll-ch")?.textContent).toBe(",");
  });
});
