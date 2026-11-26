import "@testing-library/dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
(globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true;

afterEach(cleanup);
