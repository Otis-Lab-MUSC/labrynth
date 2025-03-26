import os
from setuptools import setup, find_packages

INSTALL_REQUIRES = [
    "pyserial>=3.5",  # For serial communication in reacher.py
    "panel>=1.0.0",   # For the dashboard interfaces (local_dashboard.py, network_dashboard.py)
    "pandas>=2.0.0",  # For data handling in dashboards
    "plotly>=5.0.0",  # For plotting in dashboards
    "matplotlib>=3.5.0",  # For plotting square waves in dashboards
    "numpy>=1.22.0",  # For numerical operations in dashboards
    "requests>=2.28.0",  # For network requests in network_dashboard.py
]

setup(
    name="reacher",
    version="0.1",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=INSTALL_REQUIRES,
    package_data={
        "reacher": ["assets/*"],
    },
    author="Joshua Boquiren",
    author_email="thejoshbq@proton.me",
    description="A package necessary to run the REACHER Suite protocols.",
    long_description=open("README.md").read() if "README.md" in os.listdir() else "",
    long_description_content_type="text/markdown",
    url="https://github.com/Otis-Lab-MUSC/REACHER",
    license="MIT",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
)