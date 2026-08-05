if (process.env.ALLOW_DEVELOPMENT_SEED !== "true") {
  throw new Error("Development seed is disabled. Set ALLOW_DEVELOPMENT_SEED=true explicitly.");
}

process.stdout.write(
  "Development seed framework is ready. Synthetic records are added by their owning ERP tasks.\n",
);
