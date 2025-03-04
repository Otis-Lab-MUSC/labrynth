from flask import Blueprint, jsonify, request
from core.hardware.reacher import REACHER

def create_file_bp(reacher: REACHER):
    bp = Blueprint('file', __name__)

    @bp.route('/file/filename', methods=['POST'])
    def set_filename():
        """
        Receives the file name from the frontend and calls functions to set the
        name.
        """
        try:
            data = dict(request.get_json())
            name = str(data.get('name'))
            name = (name + '.csv') if not name.endswith('.csv') else name
            reacher.set_filename(name)
            return_dict = {
                'status': (
                    f"Successfully set filename to {name}"
                )
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @bp.route('/file/filenames', methods=['GET'])
    def get_filenames():
        """
        Retreives the file name from the backend and returns it to the front end.
        """
        try:
            filename = reacher.get_filename()
            return_dict = {
                'status': (
                    f"Successfully accessed filename"
                ),
                'filename': filename
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @bp.route('/file/destination', methods=['POST'])
    def set_destination():
        try:
            data = dict(request.get_json())
            destination = str(data.get('destination'))
            reacher.set_data_destination(destination)           
            return_dict = {
                'status': (
                    f"Successfully set file destination"
                )
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @bp.route('/file/destination_folder', methods=['GET'])
    def get_destination():
        """
        Retreives the file destination from the backend and returns it to the front end.
        """
        try:
            destination = reacher.get_data_destination()
            return_dict = {
                'status': (
                    f"Successfully accessed destination folder"
                ),
                'destination': destination
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    return bp
