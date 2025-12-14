# [DET Vocabulary](https://github.com/europanite/det_vocabulary "DET Vocabulary")

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

![OS](https://img.shields.io/badge/OS-Linux%20%7C%20macOS%20%7C%20Windows-blue)

[![CI](https://github.com/europanite/det_vocabulary/actions/workflows/ci.yml/badge.svg)](https://github.com/europanite/det_vocabulary/actions/workflows/ci.yml)
[![docker](https://github.com/europanite/det_vocabulary/actions/workflows/docker.yml/badge.svg)](https://github.com/europanite/det_vocabulary/actions/workflows/docker.yml)
[![GitHub Pages](https://github.com/europanite/det_vocabulary/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/europanite/det_vocabulary/actions/workflows/deploy-pages.yml)

A Playground for the Vocabulary Section in **Duolingo English Test**.

!["web_ui"](./assets/images/web_ui.png)

## PlayGround

 [DET Vocabulary](https://europanite.github.io/det_vocabulary/)

Select the real English words in this list.

---

## Getting Started

### 1. Prerequisites
- [Docker Compose](https://docs.docker.com/compose/)

### 2. Build and start all services:

```bash
# set environment variables:
export REACT_NATIVE_PACKAGER_HOSTNAME=${YOUR_HOST}

# Build the image
docker compose build

# Run the container
docker compose up
```

### 3. Test:
```bash
docker compose \
-f docker-compose.test.yml \
up --build --exit-code-from \
frontend_test
```

---

# License
- Apache License 2.0