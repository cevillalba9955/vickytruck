import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);

// jsdom no implementa getComputedStyle(elt, pseudoElt); antd Table lo usa
// para medir el ancho de la scrollbar (mismo stub que rs956/frontend/vitest.setup.js).
const getComputedStyleOriginal = window.getComputedStyle;
window.getComputedStyle = (elt, pseudoElt) =>
  pseudoElt ? getComputedStyleOriginal(elt) : getComputedStyleOriginal(elt, pseudoElt);

// jsdom no implementa ResizeObserver; antd Table lo usa para medir contenedores.
window.ResizeObserver =
  window.ResizeObserver ||
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

// jsdom tampoco implementa window.matchMedia; antd Table/Grid lo usan para
// los breakpoints responsivos (útil solo en un navegador real).
window.matchMedia =
  window.matchMedia ||
  function matchMediaStub(query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    };
  };
