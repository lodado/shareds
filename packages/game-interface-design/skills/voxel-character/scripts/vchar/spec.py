"""The character spec, read once from the JSON file named by VCHAR_SPEC (empty when unset)."""

import json
import os

SPEC = json.loads(open(os.environ["VCHAR_SPEC"]).read()) if os.environ.get("VCHAR_SPEC") else {}
