import sys
import os
import json
import uuid
import socket
import time
import threading
import logging
from typing import Optional, Dict, Any
from flask import Flask, jsonify
from waitress import serve
from reacher.core import REACHER 

from endpoints import serial_connection, program, file, data_processor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

UDP_PORT: int = int(os.getenv("REACHER_UDP_PORT", "7899"))
HTTP_PORT: int = int(os.getenv("REACHER_HTTP_PORT", "6229"))

class BroadcastWorker(threading.Thread):
    """A thread that broadcasts device discovery messages over UDP."""

    def __init__(self) -> None:
        """Initialize the BroadcastWorker with a unique key and local IP."""
        super().__init__()
        self.stop_event: threading.Event = threading.Event()
        self.unique_key: str = str(uuid.uuid4())
        self.local_ip: str = self.get_local_ip()

    def get_local_ip(self) -> str:
        """Retrieve the local IP address of the machine.

        Returns:
            str: The local IP address, defaults to "127.0.0.1" if detection fails.
        """
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        except Exception:
            ip = "127.0.0.1"
        finally:
            s.close()
        return ip

    def run(self) -> None:
        """Run the broadcast service, sending UDP discovery messages periodically.

        This method broadcasts a discovery payload every 5 seconds until stopped.
        """
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
                    payload: Dict[str, Any] = {
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

    def stop(self) -> None:
        """Stop the broadcast service by setting the stop event."""
        self.stop_event.set()

    def resume(self) -> None:
        """Resume the broadcast service by clearing the stop event."""
        self.stop_event.clear()

def create_app(broadcast_worker: BroadcastWorker) -> Flask:
    """Create and configure the Flask application.

    Args:
        broadcast_worker (BroadcastWorker): The broadcast worker instance to manage UDP broadcasts.

    Returns:
        Flask: The configured Flask application instance.
    """
    app: Flask = Flask(__name__)
    reacher: REACHER = REACHER()

    @app.route('/')
    def home() -> tuple[str, int]:
        """Handle the root endpoint.

        Returns:
            tuple[str, int]: A tuple containing the response message and HTTP status code.
        """
        return "REACHER API", 200

    @app.route('/connection')
    def connect() -> tuple[Dict[str, Any], int]:
        """Handle the connection endpoint, stopping the broadcast worker.

        Returns:
            tuple[Dict[str, Any], int]: A JSON response and HTTP status code.
        """
        if broadcast_worker:
            broadcast_worker.stop()
            broadcast_worker.join()
        return_dict: Dict[str, Any] = {
            'status': "Connected to REACHER API",
            'connected': True
        }
        return jsonify(return_dict), 200
    
    @app.route('/reset', methods=['POST'])
    def reset() -> tuple[Dict[str, str], int]:
        """Reset the REACHER instance.

        Returns:
            tuple[Dict[str, str], int]: A JSON response with status and message, and HTTP status code.

        Raises:
            Exception: If the reset operation fails.
        """
        try:
            if reacher:
                reacher.reset()
            return jsonify({
                'status': 'Reset successful',
                'message': 'REACHER instance has been reset'
            }), 200
        except Exception as e:
            return jsonify({
                'status': 'Reset failed',
                'message': str(e)
            }), 500

    # Register blueprints
    app.register_blueprint(serial_connection.create_serial_bp(reacher))
    app.register_blueprint(data_processor.create_data_processor_bp(reacher))
    app.register_blueprint(program.create_program_bp(reacher))
    app.register_blueprint(file.create_file_bp(reacher))

    return app

if __name__ == "__main__":
    """Main entry point for the REACHER API server."""
    sys.stdout.flush()

    broadcast_worker: BroadcastWorker = BroadcastWorker()
    broadcast_worker.start()
    
    flask_app: Flask = create_app(broadcast_worker)

    logging.info(f"REACHER API is running on http://{broadcast_worker.local_ip}:{HTTP_PORT}")
    logging.info("Press Ctrl+C to stop the server.")

    try:
        serve(flask_app, host='0.0.0.0', port=HTTP_PORT)
    except KeyboardInterrupt:
        logging.info("Shutting down services...")
        broadcast_worker.stop()
        broadcast_worker.join()
        sys.exit(0)