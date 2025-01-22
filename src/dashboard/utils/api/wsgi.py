from .app import create_app
from waitress import serve

def serve_flask(config: dict):
    app = create_app()
    serve(app, host=config["host"], port=config["port"])

if __name__ == "__main__":
    serve_flask({"host": "localhost", "port": 6229})
