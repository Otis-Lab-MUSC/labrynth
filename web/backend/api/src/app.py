import sys
import os
import json
import uuid
import socket
import time
import threading
import logging
from flask import Flask
from waitress import serve
from reacher.core import REACHER
from endpoints import home, serial_connection, program, file, data_processor

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

UDP_PORT = int(os.getenv("REACHER_UDP_PORT", 7899))
HTTP_PORT = int(os.getenv("REACHER_HTTP_PORT", 6229))

class BroadcastWorker(threading.Thread):
    def __init__(self):
        super().__init__()
        self.stop_event = threading.Event()
        self.unique_key = str(uuid.uuid4())
        self.local_ip = self.get_local_ip()

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        except Exception:
            ip = "127.0.0.1"
        finally:
            s.close()
        return ip

    def run(self):
        logging.info("Starting reacher.REACHER broadcast service...")
        logging.info(f"Using local IP: {self.local_ip}")
        logging.info(f"Generated unique key: {self.unique_key}")

        try:
            server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            server.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            server.settimeout(0.2)
            server.bind(('', 0))

            while not self.stop_event.is_set():
                try:
                    payload = {
                        "message": "REACHER_DEVICE_DISCOVERY",
                        "key": self.unique_key,
                        "name": "REACHER_Device",
                        "address": self.local_ip,
                        "port": HTTP_PORT
                    }
                    message = json.dumps(payload).encode('utf-8')
                    server.sendto(message, ('<broadcast>', UDP_PORT))
                    logging.info(f"Broadcast sent over UDP port {UDP_PORT}: {payload}")
                    time.sleep(5)
                except Exception as e:
                    logging.warning(f"Broadcast error: {e}")
        except Exception as e:
            logging.error(f"Broadcast service failed: {e}")
        finally:
            server.close()
            logging.info("Broadcast service stopped.")

    def stop(self):
        self.stop_event.set()

def create_app() -> Flask:
    app = Flask(__name__)
    reacher = REACHER()

    app.register_blueprint(home.bp)
    app.register_blueprint(serial_connection.create_serial_bp(reacher))
    app.register_blueprint(data_processor.create_data_processor_bp(reacher))
    app.register_blueprint(program.create_program_bp(reacher))
    app.register_blueprint(file.create_file_bp(reacher))

    return app

if __name__ == "__main__":
    sys.stdout.flush()

    flask_app = create_app()

    broadcast_worker = BroadcastWorker()
    broadcast_worker.start()

    logging.info(f"REACHER API is running on http://{broadcast_worker.local_ip}:{HTTP_PORT}")
    logging.info("Press Ctrl+C to stop the server.")

    try:
        serve(flask_app, host='0.0.0.0', port=HTTP_PORT)
    except KeyboardInterrupt:
        logging.info("Shutting down services...")
        broadcast_worker.stop()
        broadcast_worker.join()
        sys.exit(0)