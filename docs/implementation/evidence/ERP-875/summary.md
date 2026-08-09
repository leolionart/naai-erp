# ERP-875 summary

Repository agent instructions now require GitHub CLI release creation after any pushed commit range
that successfully builds and publishes Docker images. The release targets the exact pushed SHA and
records the immutable image tag and published image set.
