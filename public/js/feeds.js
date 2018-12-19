/**
 * SUBSCRIBE AND PUBLISH TO MQTT BROKER UPDATED BY PYTHON SCRIPT ON EmonCMS INSTALLATION
 * ----------------------------------------------------------------------------
 * @copyright {@link http://openenergymonitor.org|OpenEnergyMonitor project}
 * @see {@link http://emoncms.org|Emoncms} - Open source energy visualisation
 * @see {@link https://github.com/emoncms/remoteaccess} Code is on GitHub
 * 
 * @license
 * All Emoncms code is released under the GNU Affero General Public License.
 * See COPYRIGHT.txt and LICENSE.txt.
 * ---------------------------------------------------------------------
 * Emoncms - open source energy visualisation
 * Part of the OpenEnergyMonitor project:
 * http://openenergymonitor.org
 */

if (typeof DEBUG === 'undefined') {
    var DEBUG = false;
} else {
    Vue.config.productionTip = false;
}

// IIFE Revealing Module Pattern
// @example: {@link https://gist.github.com/zcaceres/bb0eec99c02dda6aac0e041d0d4d7bf2}
var UTILITIES = (function () {
    /**
    * Object Extending Functionality
    * Combine all the properties of subsequent arguments
    * @return <Object> out - plain object with argument objects combined
    */
    function mergeObjects(out) {
        out = out || {};
        for (var i = 1; i < arguments.length; i++) {
            if (!arguments[i])
                continue;

            for (var key in arguments[i]) {
                if (arguments[i].hasOwnProperty(key))
                out[key] = arguments[i][key];
            }
        }
        return out;
    }
    // return string suitable to be used as an object property name
    function camelCase(str) {
        // @todo: not quite "camel case"
        if(typeof str != 'undefined') return str.toLowerCase().replace(' ','_')
    }
    // public methods:
    return {
        extend: mergeObjects,
        camelCase: camelCase
    };
})();

/**
 * labels for console messages
 * groups and displays messages by type:-
 *   log, info, debug, verbose
 * @param {int} logLevel 1 - 5
 * @param {bool} isDebug switches off the messages when False
 */
var LOGGER = (function(logLevel, isDebug){
    // unicode icons to separate console log messages
    var types = ',🔷,🔶,🔵,🔴'.split(',');
    
    function getErrorObject(){
        try { throw Error('') } catch(err) { return err; }
    }

    // ouput to brower console.log
    function print() {
        // if ( ! window.console ) return;
        var args = Array.prototype.slice.call(arguments);
        var type = args.shift();
        args.unshift(types[type]);
        var type = type || 1;

        if (isDebug) {
            if (logLevel > 0) {
                if (type <= logLevel) {
                    if (logLevel === 5) {
                        console.debug('call stack:', (new Error))
                    }
                    console.log.apply(null, args);
                }
            }else{
                if(console && console.hasOwnProperty('log')){
                    console.log('logging disabled');
                }
            }
        }
    }
    log = function() {
        print.apply(null, addArg(1, arguments));
    }
    info = function() { 
        print.apply(null, addArg(2, arguments));
    }
    debug = function() { 
        print.apply(null, addArg(3, arguments));
    }
    verbose = function() { 
        print.apply(null, addArg(4, arguments));
    }
    
    addArg = function(arg, Arguments){
        var args = Array.prototype.slice.call(Arguments);
        args.unshift(arg);
        return args;
    }
    // return public variables/methods
    return {
        log: log,
        info: info,
        debug: debug,
        verbose: verbose
    }
    
})(LOG_LEVEL, DEBUG);

// end of message logging module
// ----------------------------------------------------------------------------

// GLOBAL APP STATE for all vue instances
// includes function to modify the app state values
// ----------------------------------------------------------------------------

var STORE = {
    debug: true,
    home: 'list', //first view to load
    state: {
        feeds: [],
        nodes: {},
        selectedFeeds: [],
        view: 'list',
        status: 'ready',
        error: '',
        errorTitle: ''
    },
    // edit the shared store's state with internal functions...
    toggleCollapsed: function(tag, state) {
        if (typeof state === 'undefined') state = true;
        LOGGER.debug('toggleCollapsed() triggered with', tag, state);
        if (this.state.nodes[tag]) this.state.nodes[tag].collapsed = state;
    },
    toggleFeedSelected: function(feed, state) {
        if (typeof state === 'undefined') state = false;
        LOGGER.debug('toggleFeedSelected() triggered to', state, feed.id);
        feed.selected = state;
        this.setSelectedFeeds();
    },
    getFeed(id){
        for (index in this.state.feeds) {
            feed = this.state.feeds[index];
            if (feed.id === id) return feed;
        }
        return null;
    },
    getFeeds(){
        return this.state.feeds;
    },
    setFeeds(feeds){
        this.state.feeds = feeds;
        this.setNodes();
    },
    setView: function(newView) {
        this.state.view = newView;
    },
    // toggle back to default when view already set
    toggleView: function(newView) {
        if (typeof newView === 'undefined') return false;

        newView = this.state.view === newView ? this.home : newView;
        LOGGER.verbose('MODE::: toggleView() set to ', newView);
        this.setView(newView);
    },
    // return array of selected feeds for a given tag
    getNodeSelectedFeeds: function(nodes_key) {
        var selected = [];
        let node = this.state.nodes[nodes_key];
        if (typeof node !== 'undefined') {
            for(f in node.feeds) {
                let feed = node.feeds[f];
                if(feed.selected === true) {
                    selected.push(feed);
                }
            }
        }
        return selected;
    },
    // return array of all selected feeds
    getSelectedFeeds: function() {
        var selected = [];
        for(n in this.state.feeds) {
            let feed = this.state.feeds[n];
            if(feed.selected === true){
                selected.push(feed);
            }
        }
        return selected;
    },
    setSelectedFeeds: function() {
        LOGGER.verbose('getSelectedFeeds() triggered');
        this.state.selectedFeeds = this.getSelectedFeeds();
    },
    setNodes: function(){
        LOGGER.verbose('setNodes() triggered');

        var nodes = {}
        for (key in this.state.feeds) {
            let feed = this.state.feeds[key];
            if(typeof nodes[feed.tag] === 'undefined') {
                nodes[feed.tag] = {
                    tag: feed.tag,
                    id: UTILITIES.camelCase(feed.tag)
                }
            }
            // only create the node if it doesn't already exist
            if(typeof nodes[feed.tag].feeds === 'undefined'){
                nodes[feed.tag].feeds = [];
            }
            // add the feed to the parent node
            nodes[feed.tag].feeds.push(feed);
        }

        // total up the node's feed properties
        var prevNodes = this.getNodes();

        for (n in nodes) {
            let lastupdate = 0;
            let size = 0;
            let node = nodes[n];
            for (f in node.feeds) {
                let feed = node.feeds[f];
                if (feed){
                    size += parseInt(feed.size);
                    lastupdate = parseInt(feed.time) > lastupdate ? parseInt(feed.time) : lastupdate;
                    // Declaring Reactive "selected" Property
                    if (prevNodes[n]) {
                        Vue.set(feed, 'isRight', prevNodes[n].feeds[f].isRight === true);
                        Vue.set(feed, 'selected', prevNodes[n].feeds[f].selected === true);
                    } else {
                        Vue.set(feed, 'isRight', false);
                        Vue.set(feed, 'selected', false);
                    }
                }
            }
            node.collapsed = prevNodes[n] ? prevNodes[n].collapsed : true;
            node.size = size;
            node.lastupdate = lastupdate;
        }
        STORE.state.nodes = nodes;
    },
    // return new object with each feed tag as individual object with "feeds" property
    getNodes: function() {
        return this.state.nodes;
    },
    setStatus: function(status) {
        if (status !== this.state.status) {
            LOGGER.log('------------setStatus() changed to', status,'---------------');
            this.state.status = status;
        } else {
            LOGGER.verbose('STORE: setStatus() did not change status. Was already set to', status);
        }
    },
    setErrorTitle: function(msg) {
        this.state.errorTitle = msg;
        LOGGER.verbose('STORE: setErrorTitle() triggered with', msg);
    },
    setError: function(msg) {
        this.setStatus('error');
        this.state.error = msg;
        LOGGER.verbose('STORE: setError() triggered with', msg);
    }
}
// end of vue common data and function store

//----------------------------------------------------------------------------------------

// VARIABLES, FUNCTIONS AND INIT

//----------------------------------------------------------------------------------------

// list of api endpoints
var ENDPOINTS = {
    feedlist: 'feed/list',
    graph: 'feed/data',
    saveFeed: 'feed/set',
    deleteFeed: 'feed/delete',
}

// MQTT RELATED FACTORY IIFE
// (Immediately Invoked Function Expression)
//----------------------------------------------------------------------------------------
var MQTT = (function(Store, Session, Settings, Endpoints, Logger, RefreshRate, Utils) {
    var mqttClient = null;
    // timeout the connection if nothing is returned by broker
    // probably due to python script not running
    // @todo: mqtt also has timeout & disconnect features - might be better suited?
    var timer = {
        finished: false,
        interval: null,
        started: null,
        ended: null,
        counter: 0,
        sleep: 500,
        timeout: RefreshRate * 2,
        timeoutCallback: function(){
            window.clearInterval(publishInterval);
            publishInterval = null;
            Store.setStatus('timed out');
        },
        timeTaken: function(){
            if (this.started && this.finished) {
                time = this.ended.getTime() - this.started.getTime(); // return time taken for last request
            } else if(this.started) {
                time = new Date().getTime() - this.started.getTime(); // return elapsed time if not finished
            } else {
                time = 0;
            }
            return time;
        },
        start: function () {
            this.reset();
            this.started = new Date();
            this.interval = window.setInterval(function(){
                if ((timer.counter * timer.sleep) >= timer.timeout) {
                    timer.stop(true); // timed out
                } else if (timer.finished) {
                    timer.stop(); // finished ok
                } else {
                    timer.counter ++; // keep counting
                }
            }, this.sleep);
            Logger.verbose('MQTT: timer started', this.started);
        },
        stop: function (timedOut) {
            this.ended = new Date();
            this.finished = true;
            window.clearInterval(this.interval);
            var message = '';
            if(timedOut === true) {
                this.timeoutCallback()
                message = 'timer timed-out';
            } else {
                message = 'timer stopped';
            }
            Logger.verbose('MQTT:', message, 'after', this.timeTaken()/1000, 's');
        },
        reset: function () {
            Logger.verbose('MQTT: timer reset');
            this.finished = false;
            this.interval = null;
            this.started = null;
            this.ended = null;
            this.counter = 0;
        }
    }
    
    // mqtt broker connection Settings
    var brokerOptions = {
        username: Session.username,
        password: Session.password,
        clientId: 'mqttjs_' + Session.username + '_' + Math.random().toString(16).substr(2, 8),
        port: Settings.port,
        host: Settings.host
    }
    // notify broker of disconnection
    brokerOptions.will = {
        topic: 'user/' + brokerOptions.username + '/response/' + brokerOptions.clientId,
        payload: 'DISCONNECTED CLIENT ' + brokerOptions.clientId + '--------',
        qos: 0,
        retain: false
    };
    // send publish() to mqtt broker at set interval
    var publishInterval = null

    window.addEventListener('beforeunload', function (event) {
        disconnectFromBroker();
    }, false);

    // connect to mqtt broker
    // add callback function to run when subscribed topic messages arrive
    // pass mqtt message payload to publish() function
    function connectToBroker(payload) {
        Logger.debug('MQTT: connect() called with clientId:', brokerOptions.clientId);
        mqttClient = mqtt.connect(brokerOptions.host, brokerOptions);

        mqttClient.on('connect', function (connack) {
            timer.start();
            Logger.log('MQTT: on connect callback()');
            Logger.verbose('MQTT: on connect event called with', connack);
            Store.setStatus('connected');
            var topic = "user/" + brokerOptions.username+"/response/" + brokerOptions.clientId;
            mqttClient.subscribe("user/" + brokerOptions.username+"/response/" + brokerOptions.clientId, function (err) {
                Logger.verbose('MQTT: subscribed to', topic);
                publishToBrokerAtInterval(payload);
            })
        })

        // @todo: mqttClient.on('offline', function() { console.log('react to client going offline')})
        // @todo: mqttClient.on('error', function() { console.log('react to mqtt errors (timeout,disconnect)')})

        /**
        * React when stream data is pushed to the client from the broker
        * @arg String topic
        * @arg Buffer message
        */
        mqttClient.on('message', function(topic, message) {
            timer.stop(); // stop the timeout counter
            var response = JSON.parse(message.toString()); // decode stream
            Logger.info('MQTT: received message for: ', response.request.action);
            Logger.debug('Taken', timer.timeTaken() + 'ms','for partner mqtt (sub.py) client to respond with', response.request.action);
            var result = response.result;
            if(result.success === false) {
                Logger.debug('Error:', result.message, 'Original Request:', response.request);
                // stop the auto reload of data
                interruptPublishInterval();
                Store.setStatus('error');
                Store.setErrorTitle('API Error');
                Store.setError('"' + response.request.action + '" failed. Please update your EmonCMS install to handle the required API requests.');
                // put the graph view back to the list view
                if(Store.state.view === 'graph') {
                    // Store.setView('list');
                }
            } else {
                switch(response.request.action) {
                    case Endpoints.feedlist:
                        Logger.debug('STORE: setNodes()');
                        Store.setFeeds(result);
                        break;
                    case Endpoints.graph:
                        GRAPH.plot(response);
                        break;
                    case Endpoints.saveFeed:
                        Logger.info('@todo: respond to feed->set Endpoints call');
                        Logger.debug('API: feed->set()');
                        break;
                    case Endpoints.deleteFeed:
                        Logger.info('@todo: respond to feed->delete Endpoints call');
                        Logger.debug('API: feed->delete()');
                        break;
                    default:
                        Logger.debug('MQTT: cannot respond to unrecognized action ', response.request.action);
                }
            }
        });
    }

    // make just the timer.timeTaken() public by returning ref to this function
    function getElapsedTime() {
        return timer.timeTaken();
    }

    // disconnect from mqtt broker
    function disconnectFromBroker() {
        Logger.debug('MQTT: disconnect() called.');
        interruptPublishInterval();
        try {
            mqttClient.end();
        } catch (e) {
            console.error('Problem sending disconnect packet to broker.')
        }
        Store.setStatus('disconnected');
    }

    // parameters to send as the json object for the mqtt message payload
    var default_payload_data = {
        clientId: brokerOptions.clientId,
        action: ENDPOINTS.feedlist
    }

    // publish request to mqtt broker
    function publishToBroker(input_payload) {
        if(timer.finished === true) {
            // start counting down and react to a timeout
            timer.start();
        }
        // use default values if not passed
        var payload = Utils.extend({}, default_payload_data, input_payload);
        Logger.debug('MQTT: publishing to request: ', payload);
        Store.setStatus('published')

        mqttClient.publish("user/" + brokerOptions.username + "/request", JSON.stringify(payload))
    }

    // start a setInterval at "RefreshRate" (5000 ms)
    function publishToBrokerAtInterval(payload) {
        Logger.verbose('MQTT: publish interval started');
        publishToBroker(payload);
        // Logger.log('stopped auto reload of data for testing');
        publishInterval = window.setInterval(function(){
            publishToBroker(payload)
        }, RefreshRate);
    }

    function interruptPublishInterval() {
        Logger.verbose('MQTT: publish interval stopped');
        window.clearInterval(publishInterval);
        publishInterval = null;
        Store.setStatus('paused');
        timer.stop();
    }
    // expose these functions and variables to the global variable mqtt
    return {
        disconnect: disconnectFromBroker,
        publish: publishToBroker,
        connect: connectToBroker,
        client:  mqttClient,
        start: publishToBrokerAtInterval,
        pause: interruptPublishInterval,
        options: brokerOptions,
        elapsed: getElapsedTime
    }
})(STORE, SESSION, SETTINGS, ENDPOINTS, LOGGER, 5000, UTILITIES);
// end of MQTT (IIFE) Revealing Module 
//-----------------------------------------------------------------------------


// Graph related code
//-----------------------------------------------------------------------------
var GRAPH = (function (Store, Endpoints, Mqtt, Logger){
    var brokerOptions = Mqtt.options;
    var previous_response;
    
    // publish request to mqtt broker
    function get_feed_data(feedids, start, end, interval, skipmissing, limitinterval) {
        Logger.info("GRAPH: requesting feed data");
        var publish_options = {
            clientId: brokerOptions.clientId,
            action: Endpoints.graph,
            data: {
                ids: feedids,
                start: start,
                end: end,
                interval: interval,
                skipmissing: skipmissing,
                limitinterval: limitinterval
            }
        }
        Mqtt.publish(publish_options);
    }
     // request data points in range
    function draw(feedids, start, end, interval, skipmissing, limitinterval) {
        Logger.debug("GRAPH: draw() requesting data");
        if (arguments.length === 0) {
            var npoints = 800;
            var timeWindow = 3600000 * 24; // one hour x 24 = one day
            start = new Date() - timeWindow;
            end = new Date().getTime();
            interval = Math.round(((end - start)/npoints)/1000);
            skipmissing = 1;
            limitinterval = 1;
            
            var feedidsList = [];
            for (z in Store.selectedFeeds) {
                let feed = Store.selectedFeeds[z];
                feedidsList.push(feed.id); 
            }
            feedids = feedidsList.join(',');
        }
        // request the data. received data will be plotted
        get_feed_data(feedids,start,end,interval,skipmissing,limitinterval);
    }
    // place data points 
    function plot(response) {
        // store previous response
        if (typeof response == 'undefined') {
            response = previous_response;
        } else {
            previous_response = response;
        }
        if (typeof response === 'undefined' || Object.keys(response).length == 0) return void 0;
        
        Logger.debug("GRAPH: plot() triggered with", response);
        if (typeof response === 'undefined') {
            return false;
        }

        // return api errors
        if (typeof response.result.success !== 'undefined') {
            var message = response.result.success === false ? response.result.message: 'ready';
            Logger.debug(response.request);
            Store.setError(response.result.message);
        }

        var options = {
            canvas: true,
            lines: { fill: false },
            xaxis: {
                position: 'bottom',
                mode: "time",
                timezone: "browser",
                min: response.request.data.start,
                max: response.request.data.end,
                minTickSize: [response.request.data.interval, "second"]
            },
            yaxes: [
                {}, 
                {position: 'right'}
            ],
            grid: { hoverable: true, clickable: true },
            selection: { mode: "x" },
            touch: { pan: "x", scale: "x" }
        }

        // loop through results
        var data = [];
        if(response.result == "Feed does not exist") {
            // api doesn't support
        }
        for (index in response.result) {
            // plot the data points
            var result = response.result[index];
            var feed = Store.getFeed(result.feedid);
            if (feed) {
                data.push({
                    data: result.data, 
                    label: feed.name, 
                    feedid: feed.id, 
                    yaxis: feed.isRight ? 2: 1
                });                
            }
        }
        
        var placeholder = document.querySelector('#graph');
        $.plot(placeholder, data, options);
        Logger.info('jQuery plot() function called', data);
    }

    // public functions
    return {
        plot: plot,
        draw: draw
    }
})(STORE, ENDPOINTS, MQTT, LOGGER);
// end of GRAPH self executing revealing module (IIFE) function
// "Immediately Invoked Function Expressions"

// -------------------------- end of modules ----------------------------------

// -------------------------- INIT --------------------------------------------
// auto connect on load...
MQTT.connect();

//----------------------------vue js instances --------------------------------

    // FEED LIST
    var app = new Vue({
        el: '#feedslist-section',
        data: STORE.state,
        methods: {
            list_format_updated: function(value) {
                return list_format_updated(value);
            },
            list_format_value: function(value) {
                return list_format_value(value);
            },
            toggleSelected: function(event, feed) {
                LOGGER.verbose('vm->list:toggleSelected() triggered with',event.type,feed.id);

                if (event.type === 'click'){
                    // if event not triggered by click (not change or input)
                    feed.selected = feed.selected === true ? false : true;
                    this.$nextTick(function () {
                        this.setSelectedFeeds();
                    })
                }
            },
            missedIntervals(feed) {
                var lastUpdated = new Date(feed.time * 1000);
                var now = new Date().getTime();
                var elapsed = (now - lastUpdated) / 1000;
                var missedIntervals = parseInt(elapsed / feed.interval);
                return missedIntervals;
            },
            feedListItemClass: function (feed) {
                var missedIntervals = this.missedIntervals(feed);
                var result = [];
                if (missedIntervals < 3) result.push('list-group-item-success');
                if (missedIntervals > 2 && missedIntervals < 9) result.push('list-group-item-warning');
                if (missedIntervals > 8) result.push('list-group-item-danger');
                if (feed.selected) result.push('list-group-item-selected');
                if (this.view === 'graph') result.push('pl-2');
                return result;
            },
            nodeSelectedFeeds: function(nodes_key) {
                var selectedNodeFeeds = STORE.getNodeSelectedFeeds(nodes_key);
                return selectedNodeFeeds;
            },
            getEngineName: function(feed) {
                var engines = {
                    0: 'MYSQL',
                    2: 'PHPTIMESERIES',
                    5: 'PHPFINA',
                    6: 'PHPFIWA',
                    7: 'VIRTUALFEED',   // Virtual feed, on demand post processing
                    8: 'MYSQLMEMORY',   // Mysql with MEMORY tables on RAM. All data is lost on shutdown
                    9: 'REDISBUFFER',   // (internal use only) Redis Read/Write buffer, for low write mode
                    10: 'CASSANDRA'    // Cassandra
                }
                return engines[feed.engine]
            },
            setSelectedFeeds: function() {
                STORE.setSelectedFeeds();
            }
        },
        filters: {
            prettySize: function (bytes) {
                if (typeof bytes === 'undefined') return;

                var decimals = 0
                var size = new Number(bytes).toFixed(decimals) + 'B';
                var length = bytes.toString().length
                if(length > 9) {
                    size = new Number(bytes/(1024*1024*1024)).toFixed(decimals) + ' GB';
                } else if (length > 6) {
                    size = new Number(bytes/(1024*1024)).toFixed(decimals) + ' MB';
                } else if (length > 3) {
                    size = new Number(bytes/(1024)).toFixed(decimals) + ' KB';
                }
                return size;
            }
        },
        computed: {
            feedListItemNameClass: function () {
                if (this.view === 'graph') {
                    result = 'col-md-12 col-xl-12';
                    result = '';
                } else {
                    result = 'col-md-5 col-xl-4';
                }
                return result.split(' ');
            }
        }
    }); // end of feed list vuejs
    
    // ------------------------------------------------------------------------
    
    // FEED LIST BUTTONS
    var app2 = new Vue({
        el: '#feedlist-buttons',
        data: STORE.state,
        methods: {
            // if any nodes collapsed, expand all; else collapse all
            toggleCollapseAllNodes: function() {
                var totalCollapsed = 0;
                // count collapsed nodes
                for(n in this.nodes) {
                    let node = this.nodes[n];
                    if(node.collapsed === true) totalCollapsed++;
                }
                var state = totalCollapsed > 0;
                // change node state
                for(tag in this.nodes) {
                    let node = this.nodes[tag];
                    STORE.toggleCollapsed(tag, !state);
                }
            },
            // if all feeds selected, select none; else select all.
            toggleSelectAllFeeds: function() {
                var totalSelected = STORE.getSelectedFeeds().length;
                var totalFeeds = STORE.getFeeds().length;
                var state = totalSelected < totalFeeds;
                // change feed state
                for(n in this.nodes) {
                    let node = this.nodes[n];
                    for(f in node.feeds) {
                        let feed = node.feeds[f];
                        STORE.toggleFeedSelected(feed, state);
                    }
                }
            },
            editFeeds: function(event) {
                LOGGER.verbose('vm=>btns: edit() triggered with', event);
                STORE.toggleView('edit');
                // @todo
            },
            deleteFeeds: function(event) {
                LOGGER.verbose('vm=>btns: delete() triggered with', event);
                STORE.toggleView('delete');
                // @todo
            },
            downloadFeeds: function(event) {
                LOGGER.verbose('vm=>btns: download() triggered with', event);
                STORE.toggleView('download');
                // @todo
            },
            graphFeeds: function(event) {
                LOGGER.verbose('vm=>btns: view() graphFeeds() triggered with', event.type);
                STORE.setSelectedFeeds();
                STORE.toggleView('graph');
            }
        }
    }); // end of #feedlist buttons vuejs

    // ------------------------------------------------------------------------

    var app3 = new Vue({
        el: '#graph-section',
        data:  {
            shared: STORE.state,
            local: {
                start: new Date() - (3600000 * 24),// one hour x 24 = one day
                end: new Date().getTime(),
                ymin: null,
                ymax: null,
                y2min: null,
                y2max: null,
                npoints: 800,
                tooltip: {
                    left: 0,
                    top: 0,
                    contents:'',
                    previousPoint: null,
                    show: false
                }
            }
        },
        methods: {
            layout: function(){
                if(this.shared.view === 'graph') {
                    LOGGER.debug("app3: layout() resizeing graph container");
                    this.draw();
                }
            },
            draw: function(){
                // draw and plot graph
                LOGGER.debug("app3: draw()");
                
                var skipmissing = 1;
                var limitinterval = 1;

                var feedidsList = [];
                for (z in this.shared.selectedFeeds) {
                    let feed = this.shared.selectedFeeds[z];
                    feedidsList.push(feed.id); 
                }
                // request the data. received data will be plotted
                var feedids = feedidsList.join(',');
                GRAPH.draw(feedids, this.local.start, this.local.end, this.interval, skipmissing, limitinterval)
            },
            timewindow: function(time){
                this.local.start = ((new Date()).getTime())-(3600000*24*time);	//Get start time
                this.local.end = (new Date()).getTime();	//Get end time
                this.draw();
            },
            zoomin: function(){
                var time_window = this.local.end - this.local.start;
                var middle = this.local.start + time_window / 2;
                time_window = time_window * 0.5;
                this.local.start = middle - (time_window/2);
                this.local.end = middle + (time_window/2);
                this.draw();
            },
            zoomout: function(){
                var time_window = this.local.end - this.local.start;
                var middle = this.local.start + time_window / 2;
                time_window = time_window * 2;
                this.local.start = middle - (time_window/2);
                this.local.end = middle + (time_window/2);
                this.draw();
            },
            panleft: function(){
                var time_window = this.local.end - this.local.start;
                var shiftsize = time_window * 0.2;
                this.local.start -= shiftsize;
                this.local.end -= shiftsize;
                this.draw();
            },
            panright: function(){
                var time_window = this.local.end - this.local.start;
                var shiftsize = time_window * 0.2;
                this.local.start += shiftsize;
                this.local.end += shiftsize;
                this.draw();
            },
            setRange: function(event, ranges){
                LOGGER.verbose("app3: setRange() new chart range selected");

                this.local.start = ranges.xaxis.from;
                this.local.end = ranges.xaxis.to;
                this.draw();
            },
            tooltip: function(event, pos, item){
                if (item) {
                    if (this.local.tooltip.previousPoint != item.datapoint) {
                        this.local.tooltip.previousPoint = item.datapoint;
                        var container_pos = document.querySelector('#graph').getBoundingClientRect();
                        var itemTime = item.datapoint[0];
                        var itemVal = item.datapoint[1];
                        this.local.tooltip.left = (item.pageX - (container_pos.left + 25)) + 'px'; // shift off mouse pointer pos to avoid on/off bug
                        this.local.tooltip.top = (item.pageY - (container_pos.top - 30)) + 'px'; // shift off mouse pointer pos to avoid on/off bug
                        var units = STORE.getFeed(item.series.feedid).unit;
                        this.local.tooltip.contents = itemVal.toFixed(2) + " " + units;
                        this.local.tooltip.show = true;
                    }
                } else {
                    this.local.tooltip.show = false;
                    previousPoint = null;
                }
            }
        },
        computed: {
            selectedFeedNames: function(){
                names = [];
                for(i in this.shared.selectedFeeds) {
                    var feed = this.shared.selectedFeeds[i];
                    names.push(feed.name);
                }
                if (names.length > 2) {
                    return names.length + ' feeds selected';
                } else {
                    return names.join(', ');
                }
            },
            interval: function() {
                return Math.round(((this.local.end - this.local.start)/this.local.npoints)/1000)
            }
        },
        watch: {
            'shared.selectedFeeds': {
                handler: function(){
                    // if selected feeds un-selected then hide graph
                    LOGGER.debug('vm-graph->watcher:selectedFeeds.. selection modified');
                    if (this.shared.view === 'graph') {
                        if(this.shared.selectedFeeds.length <= 0) {
                            // show full list if none selected
                            STORE.setView('list');
                        }else{
                            this.layout();
                        }
                    }
                },
                deep: true
            },
            'shared.nodes': {
                handler: function(){
                    GRAPH.plot()
                },
                deep: true
            }
        },
        mounted: function(){
            // bind the jquery events (not possible within vue template)
            $(document).on('touchend', '#graph', this.setRange);
            $(document).on('plotselected', '#graph', this.setRange);
            $(document).on('plothover', '#graph', this.tooltip);
        },
        beforeDestroy: function(){
            // remove the jquery events
            $(document).off('touchend', '#graph', this.setRange);
            $(document).off('plotselected', '#graph', this.setRange);
            $(document).off('plothover', '#graph', this.tooltip);
        }
    }); // end of #graph vuejs


    // ------------------------------------------------------------------------

    var app4 = new Vue({
        el: '#page-title',
        data: STORE.state,
        methods: {
            connect: function (){
                MQTT.connect();
            },
            on_off: function () {
                LOGGER.verbose('app4: on_off() triggered');
                if ('connected,published'.split(',').indexOf(this.status) > -1) {
                    MQTT.pause();
                } else {
                    MQTT.start();
                }
            }
        },
        computed: {
            buttonTitle: function(){
                let statuses = {
                    ready: 'connect',
                    connected: 'pause updates',
                    published: 'pause updates',
                    disconnected: 'connect',
                    'timed out': 're-connect',
                    error: 'error',
                    paused: 'connect'
                }
                return statuses[this.status];
            }
        }
    });
    
    var app5 = new Vue({
        el: '#instructions',
        data: STORE.state,
        methods: {
            reconnect: function (){
                MQTT.start();
            }
        },
        computed: {
            elapsedTime: function(){
                return MQTT.elapsed() / 1000;
            }
        }
    });

    // ------------------------------------------------------------------------
    // JQUERY & BOOTSTRAP

    // jquery accordion
    $(function(){
        $('#feedslist-section').on('hidden.bs.collapse', '.collapse', function (event) {
            var tag = $(this).data('key');
            
            // notify vuejs of dom change
            if(tag) STORE.toggleCollapsed(tag, true)
        })
        $('#feedslist-section').on('shown.bs.collapse', '.collapse', function (event) {
            var tag = $(this).data('key');
            
            // notify vuejs of dom change
            if(tag) STORE.toggleCollapsed(tag, false)
        })
    });
