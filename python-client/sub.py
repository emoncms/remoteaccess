#!/usr/bin/env python3
import json
import logging
import sys
import time
import ssl
import requests as requests
import paho.mqtt.client as paho
import os
from os import path, getenv
from dotenv import load_dotenv

_dir = path.dirname(path.dirname(path.abspath(__file__)))
# Load file from the path.
dotenv_path = path.join(_dir, '.env')
# Load local dev version if exists
if path.isfile(path.join(_dir, '.env.dev')) :
    dotenv_path = path.join(_dir, '.env.dev')

load_dotenv(dotenv_path)

#-----------------------------------------------------------
#-      SETTINGS
#-----------------------------------------------------------

host = getenv('MQTT_HOST')
username = getenv('MQTT_USERNAME')
password = getenv('MQTT_PASSWORD')
apikey = getenv('EMONCMS_APIKEY')
port = int(getenv('MQTT_PORT'))
tls = getenv('MQTT_TLS').lower() == 'true'

#-----------------------------------------------------------


logging.basicConfig(format='%(levelname)s:%(message)s', level=logging.DEBUG)

#mqtt production settings
client_id = "%s_python" % username
mqtt = {
    "host" : host,
    "username" : username,
    "password" : password,
    "port" : port,
    "pubTopic" : "user/%s/response/" % (username) ,
    "subTopic" : "user/%s/request" % username,
    "retry" : 5,
    "delay" : 2,
    "counter" : 0,
    "client" : None,
    "tls" : tls,
    "clientId" : client_id
}

# emoncms settings
emoncms = {
    "protocol" : "http://",
    "host" : "localhost",
    "port" : "80",
    "path" : "/emoncms/feed/list.json",
    "parameters" : "?",
    "apikey" : apikey
}
logging.debug("Settings: %s, %s, %s, %s. TLS:%s", mqtt["clientId"], mqtt["host"], mqtt["pubTopic"], mqtt["subTopic"], mqtt["tls"])

def initialize():
    """ init function with exception handling.
    client.loop_forever() keeps looping this code until stop_loop() called

    """
    global mqtt
    try:
        logging.info("\nStart...")

        mqtt["client"] = paho.Client(mqtt["clientId"])
        
        logging.info("registering callbacks")
        mqtt["client"].on_connect    = on_connect
        mqtt["client"].on_message    = on_message
        mqtt["client"].on_publish    = on_publish
        mqtt["client"].on_subscribe  = on_subscribe
        mqtt["client"].on_disconnect = on_disconnect

        logging.info("Connecting to: %s " % mqtt["host"])
        
        connect()
        mqtt["client"].loop_forever(timeout = mqtt["delay"])        

    except TypeError as err:
        logging.debug('Error creating connection. %s' % err)
        return

    except ValueError as err:
        logging.debug("%s: %s" % err, err.args)
        return

    except Exception as inst:
        logging.debug("Error: %s. %s", inst.args[0], inst.args[1])
        raise

    except: # catch *all* exceptions
        e = sys.exc_info()[0]
        logging.debug("Error: %s" % e)

    finally:
        mqtt["client"].loop_stop()
        logging.info("Exit\n")
        return

#####


def on_connect(client, obj, flags, rc):
    logging.info("on_connect()")

    """ function called when connection is made to mqtt server 

    Attributes:
        client -- the instance of the mqtt client that connected
        obj -- the private user data as set in Client() or user_data_set()
        flags -- response flags sent by the broker (dict) 
        rc -- response code

    """
    global mqtt
    logging.info("Connected...")
    logging.debug(paho.connack_string(rc))

    if rc == 0:
        mqtt["counter"] = 0
        logging.debug("Subscribing to \"%s\"", mqtt["subTopic"])
        client.subscribe(mqtt["subTopic"])  # subscribe
    else:
        if mqtt["counter"] < mqtt["retry"]:
            logging.debug("Reconnecting...")
            logging.debug("Waiting %s before retry" % mqtt["delay"])
            time.sleep(mqtt["delay"])
            connect()
        else:
            client.disconnect()


def on_message(client, obj, msg):
    """ function called when message is returend from the server 

    Attributes:
        client -- the instance of the mqtt client that received the message
        obj -- the private user data as set in Client() or user_data_set()
        msg - an instance of MQTTMessage. This is a class with members topic, payload, qos, retain

    """
    logging.debug(msg.topic + " " + str(msg.qos) + " " + str(msg.payload))
    message = msg.payload.decode("utf-8")
    # NEED TO ENSURE OTHER CLIENTS SET will TO - payload: 'DISCONNECTED CLIENT ' + CLIENT_ID + '--------',
    if(message.startswith('DISCONNECTED')) :
        logging.info(message)
    else:
        call_api(message)
    pass


def on_publish(client, obj, mid):
    """ function called when message is returend from the server 

    Attributes:
        client -- the instance of the mqtt client that published
        obj -- the private user data as set in Client() or user_data_set()
        mid -- message identifier

    """
    logging.debug("Message ID: " + str(mid))
    pass


def on_subscribe(client, obj, mid, granted_qos):
    """ function called when the broker has acknowledged the subscription 

    Attributes:
        client -- the instance of the mqtt client that subscribed
        obj -- the private user data as set in Client() or user_data_set()
        mid -- message identifier
        granted_qos -- list of integers that give the QoS level the broker has granted

    """
    logging.debug("Subscribed: messageid: %s,  QoS: %s" % (str(mid), str(granted_qos)))


def on_disconnect(client, userdata, rc=0):
    """ function called when the client disconnects from the broker

    Attributes
        client -- the instance of the mqtt client that disconnected
        userdata -- the private user data as set in Client() or user_data_set()
        rc -- the disconnection result. if called by disconnect() rc = 0 MQTT_ERR_SUCCESS

    """
    global mqtt
    logging.debug("Disconnected (%s)" % mqtt["counter"])
    if mqtt["counter"] < mqtt["retry"]:
        logging.info("Reconnecting...")
        logging.debug("Waiting %s before retry" % mqtt["delay"])
        time.sleep(mqtt["delay"])
        connect()
    else:
        client.loop_stop()
        logging.debug("Write to error log")
        exit()
###


def call_api(msg):
    """ Relay the message payload as an API call on the local emonCMS

    Attributes
        msg -- the response body from the ajax request

    """
    global mqtt
    logging.debug("Sending API call")
    json_data = json.loads(msg)
    # merge the default settings with ones passed in the mqtt topic
    data = merge_two_dicts(emoncms, json_data)

    uri = "%s%s:%s%s%s&apikey=%s" % (data["protocol"], data["host"], data["port"], data["path"], data["parameters"], data["apikey"])
    logging.debug("Sending API request %s" % uri)
    send_response(requests.get(uri), data["clientId"])


def send_response(response, remote_client_id):
    """ Forward the API call response (JSON) to another 
    MQTT topic the opposite client is subscibed to

    Attributes
        response -- json payload for the mqtt message

    """
    global mqtt
    logging.debug("Sending API response to: \"%s%s\"" % (mqtt["pubTopic"], remote_client_id))
    pub_response = mqtt["client"].publish(
        mqtt["pubTopic"]+remote_client_id, json.dumps(response.json()))  # publish

    logging.debug("PUBLISHED: %s", paho.error_string(pub_response.rc))
    # pub_response.wait_for_publish()


def setTLS(tls_version=None):
    """ Set the SSL options

    """
    global mqtt
    logging.info('-- SETTING TLS settings')
    mqtt["client"].tls_set(ca_certs="/usr/share/ca-certificates/mozilla/DST_Root_CA_X3.crt")

def connect():
    """ calls the mqtt client connection method 

        counts number of connection attempts
    """
    global mqtt
    # mqtt["client"].enable_logger(logger=logging)

    if mqtt["tls"] == True:
        setTLS()

    logging.debug("Attempt %s" % mqtt["counter"])
    mqtt["counter"] += 1
    mqtt["client"].username_pw_set(mqtt["username"], mqtt["password"])
    mqtt["client"].connect(mqtt["host"], mqtt["port"], 60) # connect

def merge_two_dicts(x, y):
    z = x.copy()   # start with x's keys and values
    z.update(y)    # modifies z with y's keys and values & returns None
    return z


initialize()
