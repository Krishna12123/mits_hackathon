"""
FloodLens Logging Configuration
Configures structured application logging with standardized formatting and levels.
"""
import logging
import os
import sys

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)-28s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging():
    """Initializes root and app loggers with standardized formatting."""
    log_level = getattr(logging, LOG_LEVEL, logging.INFO)

    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format=LOG_FORMAT,
        datefmt=DATE_FORMAT,
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )

    # Set third-party loggers to a reasonable level
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    logger = logging.getLogger("floodlens")
    logger.setLevel(log_level)
    return logger


logger = setup_logging()
