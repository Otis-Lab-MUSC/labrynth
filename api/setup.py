from setuptools import setup, find_packages

setup(
    name="reacher_api",
    version="1.0.0",
    description="RESTful API for controlling REACHER devices",
    author="Josh Boquiren",
    author_email="boquiren@musc.edu",
    packages=find_packages(),
    install_requires=["flask"], 
    entry_points={
        'console_scripts': [
            'reacher-api=reacher_api.app:create_app',
        ],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.6",
)
