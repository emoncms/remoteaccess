#!/usr/bin/env python
""" Fake EmonCMS input to a single input
Random number continually posted into local install of EmonCMS via API every 10 seconds.
Settings in ../remoteaccess.env  or ../remoteaccess.env.dev loaded with dotenv library
"""
import requests
import json
import time
import sys
import random
from os import path, getenv
from dotenv import load_dotenv

# load settings from .env file
_dir = path.dirname(path.dirname(path.abspath(__file__)))

if path.isfile(path.join(_dir, 'remoteaccess.env.dev')) :
    dotenv_path = path.join(_dir, 'remoteaccess.env.dev')
else:
    print('remoteaccess.env not found')
    sys.exit(0)

if path.isfile(path.join(_dir, 'remoteaccess.env.dev')) :
    dotenv_path = path.join(_dir, 'remoteaccess.env.dev')
load_dotenv(dotenv_path)

# settings
apikey = getenv('EMONCMS_APIKEY')
base_url = "http://localhost/emoncms/input/post"

def get_data(url):
    """ return the response code and response text from http request """
    response = requests.get(url)
    return "status: %s %s" % (response.status_code, response.text)

# never ending loop with 10 second interval
while True:
    # random integer between 1 and 100
    value = random.randint(1,101)
    # add url parameters to url
    url = "%s?node=emontx&json={power2:%s}&apikey=%s" % (base_url, value, apikey)
    # request http response
    response = get_data(url)
    # output response from http request
    print("%s - posted: %s" % (response, value))
    # wait 10s before iterating
    time.sleep(10)
