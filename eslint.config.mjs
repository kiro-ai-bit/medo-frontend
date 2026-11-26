import shared from "@kiro-ai-bit/eslint-config";

// Frontend layering (LLD §3): app -> features -> lib -> shared leaf modules.
// lib/ must not import app/ or features/; features may import lib + shared.
export default [
  ...shared,
  {
    ignores: [".next/**", "next-env.d.ts", "public/**"],
  },
  {
    files: ["lib/**/*.ts", "lib/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@app/*", "@features/*", "../app/*", "../features/*"],
              message: "lib/ is below features/app — no upward imports",
            },
          ],
        },
      ],
    },
  },
];
