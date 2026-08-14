# Load Testing with Taurus

This project uses Taurus to run load tests against a web application.

> **Note:** This project includes scenarios converted from Artillery. See [ARTILLERY_TO_TAURUS_CONVERSION.md](./ARTILLERY_TO_TAURUS_CONVERSION.md) for details on the conversion process and key differences between the two tools.

## Project Setup

1.  **Create and activate a virtual environment (standard python venv):**
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Running Load Tests

All test scenarios are located in the `scenarios/` directory. 

### Using Task (Recommended)

```bash
# Simple GET test
task test

# Basic load test with only GET requests
task test-get-only

# Full load test with CRUD operations
task test-full

# Error scenarios test (404s, exceptions, etc.)
task test-errors

# Complex slow test with multiple traffic spikes (~10 minutes)
task test-slow

# Run custom scenario file
task test-custom FILE=scenarios/my-test.yml
```

### Using Taurus directly

```bash
# Simple GET test
bzt scenarios/test_products.yml

# Basic load test with only GET requests
bzt scenarios/product-load-test-only-get.yml

# Full load test with CRUD operations
bzt scenarios/product-load-test.yml

# Error scenarios test (404s, exceptions, etc.)
bzt scenarios/product-error-test.yml

# Complex slow test with multiple traffic spikes (~10 minutes)
bzt scenarios/product-slow-test.yml
```

## Running Without Java (Docker)

Taurus runs scenarios through JMeter, which requires a JDK. macOS ships only a
`java` stub, so a bare `bzt` run fails with
`Child Process Error: JavaVM isn't found, automatic installation isn't implemented`.

If you would rather not install a JDK, run the scenario inside the
`blazemeter/taurus` image, which bundles Java and JMeter:

```bash
# "Lite" smoke test
task test-lite-docker

# Any other scenario
task test-docker FILE=scenarios/product-error-test.yml SCENARIO=error-scenarios
```

Two things the Docker path has to handle, both already wired into the tasks:

- Inside the container `localhost` is the container itself, so the target is
  overridden to `http://host.docker.internal:3000`. That is why `test-docker`
  needs the `SCENARIO` name — the override targets
  `scenarios.<name>.default-address`.
- The project directory is mounted at `/bzt-configs` (the image's working
  directory), so the relative `artifacts-dir` from the scenario writes reports
  straight into `reports/` on the host.

> **Note:** `blazemeter/taurus` is published for amd64 only. On Apple Silicon it
> runs under Rosetta emulation — fine for validating the script and the Grafana
> wave shape, but response times are inflated, so do not read them as real
> latency numbers.

## Available Scenarios

- **test_products.yml** - Simple GET test with 5 concurrent users and 100 iterations
- **product-load-test-only-get.yml** - Basic load test browsing products (GET only)
- **product-load-test.yml** - Full product lifecycle: GET, POST, DELETE operations
- **product-error-test.yml** - Error injection scenarios (404s, exceptions, random error codes)
- **product-slow-test.yml** - Complex 10-minute test with multiple traffic spikes and valleys
- **product-lite-test.yml** - "Lite" smoke test: 7 phases over 6.5 minutes (warm-up, cruise, ramp-up, sustained load, scale down, spike, recovery) with an 80/20 read/write mix. Twin of the Artillery scenario of the same name

Each test generates a timestamped report in the `reports/` directory.
