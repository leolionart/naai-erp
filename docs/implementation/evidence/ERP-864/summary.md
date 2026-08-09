# ERP-864 summary

The production API restart loop was caused by the API image packaging step replacing the contracts
package export map with only `./dist/index.js`. That removed
`@naai-erp/contracts/session-cookie`, which the new session authentication module imports.

`docker/Dockerfile.api` now preserves both the root contracts export and the compiled
`./session-cookie` subpath. Commit `3fed4e2` was pushed to `main`, release run `31304268255`
published the API image, and the `naai-erp` Dockge stack was updated.

