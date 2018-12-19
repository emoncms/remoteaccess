<div id="feeds-navbar" class="d-flex justify-content-md-between flex-wrap">
    <div id="page-title" class="d-flex align-items-start flex-nowrap">
        <h2 class="mb-1 mr-2 text-nowrap">Feed List</h2>
        <button id="toggleRefresh" class="btn btn-outline-secondary" @click.prevent="on_off">
            {{buttonTitle}}
        </button>
    </div>
    
    <nav id="feedlist-buttons" role="toolbar" aria-label="feed buttons"
        class="btn-toolbar d-flex justify-sm-content-end bg-sm-danger bg-md-success flex-grow-1 flex-md-grow-0">

        <div id="list-buttons" class="btn-group align-items-start mb-1" role="group" aria-label="Basic example">
            <button id="collapse-all"
                type="button"
                v-on:click="toggleCollapseAllNodes"
                class="btn btn-outline-info"
                title="collapse or expand all devices"
                data-toggle="tooltip">collapse
            </button>
            <button id="select-all"
                type="button"
                v-on:click="toggleSelectAllFeeds"
                class="btn btn-outline-info"
                title="select or de-select all feeds"
                data-toggle="tooltip"
            >select
            </button>
        </div>

        <div id="feed-buttons" class="btn-group align-items-start ml-md-1 ml-auto mb-1" role="group" aria-label="Feed Specific actions">
            <button type="button" class="btn btn-info" title="View Selected feeds as a graph" 
                v-on:click.prevent="graphFeeds"
                :aria-pressed="view === 'graph'"
                :class="{'active': view === 'graph'}"
                :disabled="selectedFeeds.length === 0"
            >
                <svg viewBox="0 0 8 8" width="16px" height="16px" style="fill:currentColor"><use href="#view"></use></svg>
            </button>
            <button type="button" class="btn btn-info" title="@todo: Edit selected feeds"
                v-on:click.prevent="editFeeds"
                :aria-pressed="view === 'edit'"
                :class="{'active': view === 'edit'}"
                :disabled="true"
             >
                <svg viewBox="0 0 8 8" width="16px" height="16px" style="fill:currentColor"><use href="#edit"></use></svg>
            </button>
            <button type="button" class="btn btn-info" title="@todo: Delete selected feeds"
                v-on:click.prevent="deleteFeeds"
                :aria-pressed="view === 'delete'"
                :class="{'active': view === 'delete'}"
                :disabled="true"
             >
                <svg viewBox="0 0 8 8" width="16px" height="16px" style="fill:currentColor"><use href="#delete"></use></svg>
            </button>
            <button type="button" class="btn btn-info" title="@todo: Download selected feeds"
                v-on:click.prevent="downloadFeeds"
                :aria-pressed="view === 'download'"
                :class="{'active': view === 'download'}"
                :disabled="true"
             >
                <svg viewBox="0 0 8 8" width="16px" height="16px" style="fill:currentColor"><use href="#download"></use></svg>
            </button>
        </div>
    </nav>
</div>

<div id="instructions">
    <div class="alert alert-warning mt-3" v-if="status === 'timed out'">
        <h5 class="alert-heading">Timed out after {{ elapsedTime }} seconds</h5>
        <p class="mb-0">Ensure that the python script <code>(sub.py)</code> is running on your <em>EmonPi</em> and <a href="#" class="alert-link" @click.prevent="reconnect">re-connect</a>.</p>
    </div>
    <p v-if="status !== 'timed out'" class="d-none d-sm-block">
        <a href="https://emoncms.org">Emoncms</a> is a powerful open-source web-app for processing, logging and visualising energy, temperature and other environmental data. This data is loaded from your local install of EmonCMS.
    </p>
</div>

<div class="row split">
    <section id="graph-section" class="col col-slide animate" 
        :class="{'wide': shared.view == 'graph', 'col-hidden': shared.view === 'list'}"
    >
        <transition name="fade">
        <h2 class="animate" v-if="false && shared.selectedFeedNames !== ''">Graph: {{ shared.selectedFeedNames }} </h2>
        </transition>
        <div v-if="shared.status === 'error'" class="alert alert-warning">
            <h4 class="alert-heading"> {{ shared.errorTitle }} </h4>
            {{ shared.error }}
        </div>
        <div id="tooltip" style="opacity:.8;z-index:2" class="p-2 font-weight-bold position-absolute bg-light"
            :style="{top: local.tooltip.top, left: local.tooltip.left, display: local.tooltip.show ? 'block': 'none'}" 
        >
            {{local.tooltip.contents}}
        </div>
        <div id="graph_bound" style="height: 100%; max-height: 500px; width: 100%;">
            <div id="graph" style="width:100%; height: 100%"></div>
            <div id="graph-buttons" class="btn-toolbar d-flex justify-content-around">
                <div class="btn-group mb-2" role="toolbar">
                    <button class="btn btn-outline-info" type="button" @click="timewindow(1)">D</button>
                    <button class="btn btn-outline-info" type="button" @click="timewindow(7)">W</button>
                    <button class="btn btn-outline-info" type="button" @click="timewindow(30)">M</button>
                    <button class="btn btn-outline-info" type="button" @click="timewindow(365)">Y</button>
                </div>

                <div class="btn-group mb-2" id="graph-navbar" role="toolbar">
                    <button class="btn btn-outline-secondary" @click="zoomin">+</button>
                    <button class="btn btn-outline-secondary" @click="zoomout">-</button>
                    <button class="btn btn-outline-secondary" @click="panleft"><</button>
                    <button class="btn btn-outline-secondary" @click="panright">></button>
                </div>
            </div>
        </div>
    </section><!-- /#graph-section -->
    

    <section id="feedslist-section" class="col animate" :class="{'col-4': view === 'graph'}">

        <div v-if="nodes.length == 0" id="loading" class="alert alert-warning">
            <strong>Loading:</strong> Remote feed list, please wait 5 seconds&hellip;
        </div>

        <div v-for="(node, nodes_key) in nodes"
            v-bind:class="node.status"
            class="card dropup mb-1"
        >
            <div class="card-header p-0" :id="'heading_' + node.id">
                <a class="d-flex no-gutters text-body justify-content-between py-2 no-underline row"
                data-toggle="collapse"
                v-bind:href="'#collapse_' + node.id"
                v-bind:class="{'collapsed': node.collapsed !== false}"
                v-bind:aria-controls="'collapse_' + node.id"
                >
                    <div class="d-flex col justify-content-between">
                        <h5 class="col d-flex mb-0 col-md-8 col-xl-6" :class="{'w-100': view === 'graph'}">{{node.tag}}
                            <transition name="fade">
                            <small v-if="nodeSelectedFeeds(nodes_key).length > 0" class="font-weight-light text-muted d-narrow-none pl-1">
                                ({{ nodeSelectedFeeds(nodes_key).length }})
                            </small>
                            </transition>
                        </h5>
                        <transition name="slide">
                        <div v-if="view === 'list'" class="col d-none d-sm-block ml-4 pl-4 ml-md-0 pl-md-1 ml-lg-5 pl-lg-3 ml-xl-5 pl-xl-3 text-muted">
                            {{node.size | prettySize}}
                        </div>
                        </transition>
                    </div>
                    <transition name="slide">
                    <div v-if="view === 'list'" class="col text-truncate dropdown-toggle d-none d-sm-block col-3 text-right"
                        v-html="list_format_updated(node.lastupdate)"
                    ></div>
                    </transition>
                </a>
            </div><!-- /.card-header -->

            <div class="collapse"
                v-bind:id="'collapse_' + node.id"
                v-bind:data-key="nodes_key"
                v-bind:class="{'show': !node.collapsed}"
                v-bind:aria-labelledby="'heading_' + node.id"
            >
                <ul id="feed-list" class="list-group list-group-flush">
                    <li class="list-group-item pl-0"
                        v-for="(feed, feed_id) in node.feeds"
                        data-toggle="popover"
                        data-content="@todo: fill tooltip"
                        v-bind:class="feedListItemClass(feed)"
                        v-bind:data-id="feed.id"
                        v-bind:title="'feed #' + feed.id"
                    >
                        <div class="d-flex justify-content-between no-gutters" :class="{'xno-gutters': view === 'list'}">
                            <div class="col col-8 col-lg-9" :class="{'col-12': view === 'graph','col-lg-12': view === 'graph'}">
                                <div class="d-flex no-gutters align-items-center" :class="{'xno-gutters': view === 'list'}">
                                    <div v-if="view === 'list'" class="pl-3 pull-left">
                                        <div class="custom-control custom-checkbox text-center">
                                            <input class="custom-control-input select-feed"
                                                type="checkbox"
                                                aria-label="select this feed"
                                                v-bind:id="'select-feed-' + feed.id"
                                                v-bind:data-id="feed.id"
                                                v-model="feed.selected"
                                                v-on:change="setSelectedFeeds"
                                            >
                                            <label v-bind:for="'select-feed-' + feed.id" class="custom-control-label position-absolute"></label>
                                        </div>
                                    </div>
                                    <div class="col pl-1 row no-gutters align-items-center">
                                        <div class="feed-name text-truncate col" 
                                            v-bind:title="feed.name"
                                            v-bind:class="feedListItemNameClass" 
                                            v-on:click.self="toggleSelected($event, feed)"
                                        >
                                            {{feed.name}}
                                        </div>
                                        <div class="btn-group col col-auto btn-group-sm" :class="{'d-none':view==='list' || !feed.selected}">
                                            <button class="btn btn-outline-info" :class="{'active':!feed.isRight}" @click="feed.isRight = false">&lt;</button>
                                            <button class="btn btn-outline-info" :class="{'active':feed.isRight}" @click="feed.isRight = true">&gt;</button>
                                        </div>
                                    </div>

                                    <div v-if="view === 'list'" class="d-none col d-none d-sm-flex col-5 col-lg-6 col-xl-4">
                                        <div class="d-none d-sm-block pull-left" v-bind:title="feed.public ? 'Public': 'Private'">
                                            <svg viewBox="0 0 8 8" width="16px" height="16px" style="fill:currentColor">
                                                <use v-bind:href="feed.public == 1 ? '#lock-unlocked': '#lock-locked'"></use>
                                            </svg>
                                        </div>
                                        <div class="col d-none d-md-block text-truncate col-5 col-md-6" v-bind:title="getEngineName(feed)">
                                            {{getEngineName(feed)}}
                                        </div>
                                        <div class="col d-none d-sm-block col-6 col-sm-10 ml-lg-1 ml-xl-0">
                                            {{feed.size | prettySize }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col col-sm-4 col-lg-3" v-if="view === 'list'">
                                <div class="row no-gutters">
                                    <div class="col text-right text-truncate pr-2">
                                        {{list_format_value(feed.value)}} {{feed.unit}}
                                    </div>
                                    <div class="col col-6 col-md-5 text-right d-none d-sm-block" v-html="list_format_updated(feed.time)"></div>
                                </div>
                            </div>
                        </div>
                    </li>
                </ul>
            </div><!-- /.collapse -->
        </div><!-- /.card -->
    </section><!-- /#feeds-section -->
</div><!-- /.row -->

<script>
    // session variables
    var SESSION = <?php echo json_encode($session); ?>;
    // application settings
    var SETTINGS = <?php echo json_encode($settings); ?>;
    // client logging
    var LOG_LEVEL = <?php echo defined('JS_LOG_LEVEL') ? JS_LOG_LEVEL: 0 ?>;
    // debug toggle
    var DEBUG = <?php echo defined('DEBUG') && DEBUG === true ? 'true': 'false' ?>;
</script>

