from sqlalchemy import create_engine
from env import require_env

DB_URL = require_env('POSTGRES_URL')

db_engine = create_engine(
    DB_URL,
    # if we want to configure the connection pool:
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
    pool_pre_ping=True
)
