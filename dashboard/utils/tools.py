import requests, socket, time, json
from typing import Dict
from utils.config import REACHER_KEY, REACHER_BROADCAST

def discover_reacher_services(timeout: int = 5) -> Dict[str, Dict[str, str]]:
    services = {}
    print(f"Listening for devices broadcasting REACHER key...")

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.bind(("", REACHER_KEY))  # Bind to the broadcast port
        sock.settimeout(timeout)

        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                data, addr = sock.recvfrom(1024)  # buffer size of 1024 bytes
                try:
                    payload = json.loads(data.decode("utf-8"))  # Parse as JSON
                    message = payload.get("message")
                    unique_key = payload.get("key")

                    if message == REACHER_BROADCAST:  # Validate message
                        try:
                            hostname = socket.gethostbyaddr(addr[0])[0]
                        except socket.herror:
                            hostname = "Unknown Device"

                        services[addr[0]] = {
                            "name": hostname,
                            "address": addr[0],
                            "port": addr[1],
                            "key": unique_key  # Include the unique key
                        }
                        print(f"Discovered device [{hostname}] at {addr[0]}:{addr[1]} with key: {unique_key}")
                except json.JSONDecodeError:
                    print(f"Invalid JSON received from {addr}")
            except socket.timeout:
                break  # exit the loop if timeout is reached
            except Exception as e:
                print(f"Error receiving broadcast: {e}")

    return services

def scan_ports(ip_address, start_port, end_port):
    for port in range(start_port, end_port + 1):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        result = sock.connect_ex((ip_address, port))
        if result in [0, 10035]:
            sock.close()
            return port
        sock.close()
    return None 

def handle_response(response: requests.Response):
    """
    Handles HTTP responses, raising exceptions or returning JSON.
    """
    try:
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as e:
        return {"error": f"HTTPError: {e}"}
    except Exception as e:
        return {"error": f"Error: {e}"}
    
def get_time():
    local_time = time.localtime()
    formatted_time = time.strftime("%Y-%m-%d %H:%M:%S", local_time)
    return formatted_time

