import sys
from pathlib import Path

# ml/ isn't set up as an installable package; add it to sys.path so tests can
# `import train` directly, matching how the training script is actually run
# (`python3 ml/train.py` from the repo root).
sys.path.insert(0, str(Path(__file__).resolve().parent))
