# [DET Vocabulary](https://github.com/europanite/det_vocabulary "DET Vocabulary")

[![CI](https://github.com/europanite/det_vocabulary/actions/workflows/ci.yml/badge.svg)](https://github.com/europanite/det_vocabulary/actions/workflows/ci.yml)
[![docker](https://github.com/europanite/det_vocabulary/actions/workflows/docker.yml/badge.svg)](https://github.com/europanite/det_vocabulary/actions/workflows/docker.yml)
[![GitHub Pages](https://github.com/europanite/det_vocabulary/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/europanite/det_vocabulary/actions/workflows/deploy-pages.yml)

A Duolingo English Test Vocabulary Section Playground.

!["web_ui"](./assets/images/web_ui.png)

## PlayGround

 [DET Vocabulary](https://europanite.github.io/det_vocabulary/)

Select the real English words in this list.

---

## Getting Started

### 1. Prerequisites
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)

### 2. Build and start all services:

```bash
# set environment variables:
export REACT_NATIVE_PACKAGER_HOSTNAME=192.168.3.6

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