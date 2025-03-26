from flask import Flask
import socket
import time
import threading
import signal
import logging
import sys
import os
import json, uuid
from reacher.core import REACHER
from endpoints import home, serial_connection, program, file, data_processor
from waitress import serve

from PySide6.QtWidgets import QApplication, QMainWindow, QLabel, QMessageBox
from PySide6.QtGui import QIcon
from PySide6.QtCore import Qt, QThread, Signal

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

UDP_PORT = int(os.getenv("REACHER_UDP_PORT", 7899))
HTTP_PORT = int(os.getenv("REACHER_HTTP_PORT", 6229))

class BroadcastWorker(QThread):
    log_signal = Signal(str)
    
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

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("REACHER API")
        self.setGeometry(100, 100, 300, 100)

        label = QLabel("Running REACHER API...\n(keep this window open)")
        label.setAlignment(Qt.AlignCenter)
        self.setCentralWidget(label)

        self.broadcast_worker = BroadcastWorker()
        self.broadcast_worker.start()

    def closeEvent(self, event):
        reply = QMessageBox.question(
            self,
            "Quit REACHER API",
            "Do you really want to quit? This action is irreversible.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            self.broadcast_worker.stop()
            self.broadcast_worker.wait()  
            event.accept()
        else:
            event.ignore()

def shutdown_service(signal, frame):
    logging.info("Shutting down services...")
    sys.exit(0)

signal.signal(signal.SIGINT, shutdown_service)
signal.signal(signal.SIGTERM, shutdown_service)

if __name__ == "__main__":
    sys.stdout.flush()
    
    flask_app = create_app()
    
    qt_app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    
    flask_thread = threading.Thread(
        target=serve, 
        args=(flask_app,), 
        kwargs={'host': '0.0.0.0', 'port': HTTP_PORT},
        daemon=True
    )
    flask_thread.start()
    
    sys.exit(qt_app.exec())