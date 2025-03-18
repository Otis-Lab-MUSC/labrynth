from setuptools import setup, find_packages

with open('README.md', 'r', encoding='utf-8') as f:
    long_description = f.read()

setup(
    name='reacher',
    version='0.1',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    install_requires=[],
    package_data={'reacher': ['assets/*']},
    
    author='Joshua Boquiren',
    author_email='thejoshbq@proton.me',
    
    description='A package necessary to run the REACHER Suite protocols.',
    long_description=long_description,
    long_description_content_type='text/markdown', 
    
    url='https://github.com/Otis-Lab-MUSC/REACHER-Suite',
    license='MIT',
    classifiers=[
        'Development Status :: 3 - Alpha',
        'Intended Audience :: Developers',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
    ],
    python_requires='>=3.8',
)