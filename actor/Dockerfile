# Apify Python base image (Python 3.12, includes the platform tooling)
FROM apify/actor-python:3.12

# Install dependencies first so Docker caches this layer
COPY requirements.txt ./
RUN echo "Python version:" \
 && python --version \
 && echo "Installing dependencies:" \
 && pip install --no-cache-dir -r requirements.txt \
 && echo "All installed Python packages:" \
 && pip freeze

# Copy the source and byte-compile it to catch syntax errors at build time
COPY . ./
RUN python3 -m compileall -q src/

CMD ["python3", "-m", "src"]
