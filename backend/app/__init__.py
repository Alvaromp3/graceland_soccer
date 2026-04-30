"""
Elite Sports Performance Analytics Backend.

Central place for global warning filters so they apply in:
- the API server startup (uvicorn -> app.main)
- unit tests importing services directly (no app.main involved)
"""

import warnings

try:
    from sklearn.exceptions import InconsistentVersionWarning  # type: ignore

    # Be strict: never show model version mismatch warnings in runtime/tests.
    warnings.simplefilter("ignore", InconsistentVersionWarning)
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
    warnings.filterwarnings("ignore", message=r"Trying to unpickle estimator .*")
except Exception:
    pass

# LightGBM / sklearn: predicting with ndarray when model was trained with feature names
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r"X does not have valid feature names, but .* was fitted with feature names",
)
