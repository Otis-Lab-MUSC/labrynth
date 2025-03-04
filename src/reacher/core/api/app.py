from flask import Flask
import socket
import time
import threading
import signal
import logging
import sys
import os
import json, uuid
from ..hardware.reacher import REACHER
from .endpoints import home, serial_connection, program, file, data_processor

logging.basicConfig(level=logging.INFO)
stop_event = threading.Event()
UDP_PORT = int(os.getenv("REACHER_UDP_PORT", 7899))
HTTP_PORT = int(os.getenv("REACHER_HTTP_PORT", 6229))

def run_service():
    if stop_event.is_set():
        stop_event.clear(
            
        )
    logging.info("Starting REACHER broadcast service...")
    unique_key = str(uuid.uuid4())
    logging.info(f"Generated unique key: {unique_key}")

    try:
        server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        server.settimeout(0.2)
        server.bind(('', 0))
        
        while not stop_event.is_set():
            try:
                payload = {
                    "message": "REACHER_DEVICE_DISCOVERY",
                    "key": unique_key
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

def end_service():
    stop_event.set()

def shutdown_service(signal, frame):
    logging.info("Shutting down services...")
    stop_event.set()
    sys.exit(0)

signal.signal(signal.SIGINT, shutdown_service)

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
    from waitress import serve
    logging.info("Starting Flask app with Waitress...")
    app = create_app()
    serve(app, host='0.0.0.0', port=HTTP_PORT)