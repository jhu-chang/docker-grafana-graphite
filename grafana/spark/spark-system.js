/* global _ */

'use strict';

// accessible variables in this scope
var window, document, $, jQuery, moment, kbn;

// All url parameters are available via the ARGS object
var ARGS;

function getBoolParam(b, def) {
    if (_.isUndefined(b)) return def;
    return b == '1' || b == 'true' || b == 'on' || b.toLowerCase() == 'yes';
}

function getIntParam(i, def) {
    if (_.isUndefined(i)) return def;
    return parseInt(i);
}

var now = false;
var legends = getBoolParam(ARGS.legends, true);
var sharedTooltip = getBoolParam(ARGS.sharedTooltip, true);
var simpleView = getBoolParam(ARGS.simple, false);
var spanValue = getIntParam(ARGS.span, 6);
var systemSpan = getIntParam(ARGS.span, 4);

// default span for simple view is 6
if (simpleView) {
    systemSpan = getIntParam(ARGS.span, 6);
}

function getPrefix() {
    if (!_.isUndefined(ARGS['var-prefix'])) {
        return ARGS['var-prefix'];
    }
    if (_.isUndefined(ARGS.app) && _.isUndefined(ARGS.prefix)) {
        return "*"
    }
    if (!_.isUndefined(ARGS.app)) {
        return ARGS.app
    }
    if (!_.isUndefined(ARGS.prefix)) {
        return ARGS.prefix
    }
}

function getWorkerNode() {
    if (_.isUndefined(ARGS.executor)) {
        return "driver"
    } else {
        return ARGS.executor
    }
}

function getAlias(str) {
    if (str === "*") {
        return "All";
    } else {
        return str;
    }
}

// "Template" variables: dynamically configurable on the page's title-bar.
var prefixTemplateVar = {
    type: "query",
    name: "prefix",
    options: [
        {
            text: getAlias(getPrefix()),
            value: getPrefix()
        }
    ],
    datasource: "graphite",
    query: "*",
    refresh: true,
    useTags: false,
    hideLabel: false,
    regex: "/[a-zA-Z]+-\\d+/",
    label: "Application",
    tagValuesQuery: "",
    tagsQuery: "",
    allFormat: "glob",
    includeAll: true,
    multi: true,
    multiFormat: "glob",
    current: {
        text: getAlias(getPrefix()),
        value: getPrefix()
    }
};

var executorRangeTemplateVar = {
    type: "query",
    name: "executors",
    options: [
        {
            text: getAlias(getWorkerNode()),
            value: getWorkerNode()
        }
    ],
    datasource: "graphite",
    query: "$prefix.*",
    refresh: true,
    useTags: false,
    hideLabel: false,
    regex: "",
    label: "Executors",
    tagValuesQuery: "",
    tagsQuery: "",
    allFormat: "glob",
    includeAll: true,
    multi: true,
    multiFormat: "glob",
    current: {
        text: getAlias(getWorkerNode()),
        value: getWorkerNode()
    }
};


// Graphite helper functions, for query-construction clarity
// elsewhere in this file.
function aliasSub(target, find, repl) {
    return "aliasSub(" + target + ", '" + find + "', '" + ((repl == undefined) ? "\\1" : repl) + "')";
}
function aliasByExecutorId(target) {
    return aliasSub(target, '^[^.]+\\.([^.]+)\\..*');
}

function scale(target, factor) {
    return "scale(" + target + ", " + factor + ")";
}

function alias(target, name) {
    return "alias(" + target + ", '" + name + "')";
}
function percentileOfSeries(target, percentile) {
    return "percentileOfSeries(" + target + ", " + percentile + ", 'false')";
}
function summarize(target, interval, fn) {
    return "summarize(" + target + ", '" + (interval || '10s') + "', '" + (fn || 'avg') + "', false)";
}
function nonNegativeDerivative(target) {
    return "nonNegativeDerivative(" + target + ")";
}
function perSecond(target) {
    return "perSecond(" + target + ")";
}
function sumSeries(target) {
    return "sumSeries(" + target + ")";
}

function diffSeries(s1, s2) {
    return "diffSeries(" + s1 + ", " + s2 + ")";
}

function curretAbove(target, n) {
    return "currentAbove(" + target + "," + n + ")";
}
function prefix(target, range) {
    return "$prefix." + (range || '$executors') + ".executor." + target;
}


// Some panel-JSON-construction helpers.
function legend(show) {
    return {show: show, hideEmpty: true}
}

// Merge two objects.
function merge(src, dest) {
    if (src) {
        for (var k in src) {
            if (src.hasOwnProperty(k)) {
                if (dest.hasOwnProperty(k) && typeof(src[k]) == 'object') {
                    dest[k] = merge(src[k], dest[k]);
                } else {
                    dest[k] = src[k];
                }
                if (k == 'pointradius' && src[k] > 0) {
                    dest.points = true;
                }
            }
        }
    }
    return dest;
}

// Base function to set some boilerplate panel-configuration values.
function panel(title, targets, opts, showLegend) {
    var legendVar = (showLegend == undefined) ? legends : showLegend;
    return merge(
        opts,
        {
            title: title,
            span: 4,
            type: "graph",
            nullPointMode: "null",
            datasource: "graphite",
            tooltip: {
                shared: sharedTooltip
            },
            legend: legend(legendVar),
            targets: targets.map(function (target) {
                return {target: target};
            })
        }
    );
}

function getFrom() {
    if (_.isUndefined(ARGS.from)) {
        return 'now-1h';
    }
    if (ARGS.from.match(/^now-[0-9]+/)) {
        return ARGS.from;
    }
    return new Date(ARGS.from).toString();
}

function getTo() {
    if (_.isUndefined(ARGS.to)) {
        return 'now';
    }
    if (ARGS.to.match(/^now-[0-9]+/)) {
        return ARGS.to;
    }
    return new Date(ARGS.to).toString();
}

// Dashboard boilerplate.
var dashboard = {
    title: "System dashboards",
    rows: [],
    style: "dark",
    nav: [
        {
            type: "timepicker",
            collapse: false,
            notice: false,
            enable: true,
            status: "Stable",
            time_options: [
                "5m",
                "15m",
                "1h",
                "2h",
                "3h",
                "4h",
                "6h",
                "12h",
                "24h",
                "2d",
                "7d",
                "30d"
            ],
            refresh_intervals: [
                "5s",
                "10s",
                "30s",
                "1m",
                "5m",
                "15m",
                "30m",
                "1h",
                "2h",
                "1d"
            ],
            now: true
        }
    ],
    time: {
        from: getFrom(),
        to: getTo(),
        now: "now"
    },
    templating: {
        enable: true,
        list: [
            prefixTemplateVar,
            executorRangeTemplateVar
        ]
    },
    refresh: "30s"
};

// Return a panel displaying JVM stats for an executor or driver.
function executorJvmPanel(id, opts) {
    opts = opts || {};
    opts.nullPointMode = 'connected';
    opts.y_formats = ["percent", "none"];

    return panel(
        id + ": GC tiers / generations",
        [
            aliasSub(
                aliasSub(
                    scale(curretAbove("$prefix." + id + ".jvm.pools.*.usage", 0), 100),
                    "^.*\\.([^.]*)\\.usage.*"
                ),
                "(PS-)?(-Space)?-?",
                ""
            ),
            aliasSub(
                scale(curretAbove("$prefix." + id + ".jvm.{non-heap,heap}.usage", 0), 100),
                ".*\\.((non-)?heap)\\..*"
            )
        ],
        opts
    );
}

function executorGCSummaryPanel(id, opts) {
    opts = opts || {};
    opts = merge(opts,
        {
            nullPointMode: 'connected',
            pointradius: 1,
            stack: true,
            fill: 10,
            tooltip: {
                value_type: "individual"
            },
            y_formats: [
                "ms",
                "none"
            ]
        }
    );
    return panel(
        id + ": GC Time/second",
        [
            alias(perSecond("$prefix." + id + ".jvm.PS-Scavenge.time"), 'Scavenge GC time'),
            alias(perSecond("$prefix." + id + ".jvm.PS-MarkSweep.time"), 'MarkSweep GC time')
        ],
        opts
    );
}

function getJVMPanels() {
    return [
        panel(
            "$executors: Scavenge GC per minute",
            [
                alias(nonNegativeDerivative(
                    summarize(
                        "$prefix.$executors.jvm.PS-Scavenge.count",
                        '1m',
                        'max'
                    )
                ), 'GC Count'),
                alias(nonNegativeDerivative(
                    summarize(
                        "$prefix.$executors.jvm.PS-Scavenge.time",
                        '1m',
                        'max'
                    )
                ), 'GC time')

            ],
            {
                span: spanValue,
                nullPointMode: 'connected',
                seriesOverrides: [
                    {
                        alias: "GC time",
                        yaxis: 2
                    }
                ],
                y_formats: [
                    "short",
                    "ms"
                ],
                leftYAxisLabel: "GC Count"
            }
        ),
        panel(
            "$executors: MarkSweep GC per minute",
            [
                alias(nonNegativeDerivative(
                    summarize(
                        "$prefix.$executors.jvm.PS-MarkSweep.count",
                        '1m',
                        'max'
                    )
                ), 'GC Count'),
                alias(nonNegativeDerivative(
                    summarize(
                        "$prefix.$executors.jvm.PS-MarkSweep.time",
                        '1m',
                        'max'
                    )
                ), 'GC time')
            ],
            {
                span: spanValue,
                nullPointMode: 'connected',
                seriesOverrides: [
                    {
                        alias: "GC time",
                        yaxis: 2
                    }
                ],
                y_formats: [
                    "short",
                    "ms"
                ],
                leftYAxisLabel: "GC Count"
            }
        ),
        executorJvmPanel("$executors", {span: spanValue}),
        executorGCSummaryPanel("$executors", {span: spanValue})
    ]
}

function getMemoryPanel() {
    if (simpleView) {
        return []
    } else {
        return [panel("$executors: Memory Usage",
            [
                alias("$prefix.$executors.system.used_mem", "System Used CPU"),
                alias("$prefix.$executors.system.free_mem", "System Free CPU")
            ],
            {
                stack: true,
                fill: 10,
                nullPointMode: 'connected',
                span: systemSpan,
                y_formats: [
                    "bytes",
                    "percent"
                ],
                grid: {
                    leftMin: 0,
                    leftMax: null
                },
                tooltip: {
                    value_type: "individual"
                }
            }
        )]
    }
}


var system_metrics = {
    title: "System metrics $executors",
    height: "300px",
    editable: true,
    collapse: false,
    repeat: "executors",
    panels: [
        panel("$executors: CPU Usage",
            [
                alias("$prefix.$executors.system.cpu.combined", "Total"),
                alias("$prefix.$executors.system.cpu.user", "User"),
                alias("$prefix.$executors.system.cpu.sys", "Sys"),
                alias("$prefix.$executors.system.cpu.idle", "Idle"),
                alias("$prefix.$executors.system.cpu.wait", "Wait")
            ],
            {
                nullPointMode: "connected",
                span: 6,
                y_formats: [
                    "percentunit",
                    "short"
                ],
                grid: {
                    leftMin: null,
                    leftMax: null
                }
            }
        ),
        panel("$executors: Process CPU Usage",
            [
                alias(sumSeries("$prefix.$executors.proc_*.cpu_usage"), "Java Process CPU")
            ],
            {
                nullPointMode: "connected",
                span: 6,
                y_formats: [
                    "percentunit",
                    "short"
                ],
                grid: {
                    leftMin: null,
                    leftMax: null
                }
            }
        ),
        panel("$executors: File System Usage",
            [
                alias(perSecond("$prefix.$executors.system.disk_read_bytes"), "Disk Read"),
                alias(perSecond("$prefix.$executors.system.disk_write_bytes"), "Disk Write")
            ],
            {
                stack: true,
                fill: 10,
                nullPointMode: 'connected',
                span: systemSpan,
                y_formats: [
                    "Bps",
                    "percent"
                ],
                grid: {
                    leftMin: 0,
                    leftMax: null
                },
                tooltip: {
                    value_type: "individual"
                }
            }
        ),
        panel("$executors: Network Traffic",
            [
                alias(
                    perSecond(diffSeries("$prefix.$executors.system.total_rx_bytes",
                        sumSeries("$prefix.$executors.system.lo*_rx_bytes"))),
                    "Network Read"),
                alias(perSecond(diffSeries("$prefix.$executors.system.total_tx_bytes",
                    sumSeries("$prefix.$executors.system.lo*_tx_bytes"))), "Network Write")
            ],
            {
                stack: true,
                fill: 10,
                nullPointMode: 'connected',
                span: systemSpan,
                y_formats: [
                    "Bps",
                    "percent"
                ],
                grid: {
                    leftMin: 0,
                    leftMax: null
                },
                tooltip: {
                    value_type: "individual"
                }
            }
        )
    ].concat(getMemoryPanel())
}

var SystemMetricHead =  {
    "collapse": false,
    "editable": true,
    "height": "100px",
    "repeat": "executors",
    "panels": [
        {
            "content": "## System Metrics for $executors\n\n* The following metrics related to the host OS (most of" +
            " the metrics gathering are achieved using [Sigar][SigarLink])\n[SigarLink]: https://support.hyperic.com/display/SIGAR/Home \"Sigar Home\"\n\n",
            "editable": true,
            "error": false,
            "id": 16,
            "links": [],
            "mode": "markdown",
            "span": 12,
            "style": {},
            "title": "",
            "type": "text"
        }
    ],
    "title": "System Header Row"
}

var JVMMetricHead =  {
    "collapse": false,
    "editable": true,
    "height": "100px",
    "repeat": "executors",
    "panels": [
        {
            "content": "##  JVM Metrics for $executors\n\n* The following metrics related to the host Java \n\n",
            "editable": true,
            "error": false,
            "id": 16,
            "links": [],
            "mode": "markdown",
            "span": 12,
            "style": {},
            "title": "",
            "type": "text"
        }
    ],
    "title": "JVM Header Row"
}

var JVM_Metrics = {
    title: "JVM metrics $executors",
    height: "300px",
    editable: true,
    collapse: false,
    repeat: "executors",
    panels: getJVMPanels()
}

function getJVMRows() {
    if (simpleView) {
        return []
    } else {
        return [
            JVMMetricHead,
            JVM_Metrics
        ]
    }
}

function getSystemRows() {
    return [
        SystemMetricHead,
        system_metrics
    ]
}



dashboard.rows = getSystemRows().concat(getJVMRows())

console.log("Returning: %O", dashboard);

return dashboard;
