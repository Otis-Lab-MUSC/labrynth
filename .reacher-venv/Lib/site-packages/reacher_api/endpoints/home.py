from flask import Blueprint, jsonify

bp = Blueprint('home', __name__)

@bp.route('/')
def home():
    return "REACHER API", 200

@bp.route('/home/connection')
def connect():
    return_dict = {
        'status': "Connected to REACHER API",
        'connected': True
    }
    return jsonify(return_dict), 200