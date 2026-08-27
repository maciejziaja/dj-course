from application import app
from env import require_env

PORT = int(require_env('PORT'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
