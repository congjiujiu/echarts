/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import {__DEV__} from '../config';
import * as zrUtil from 'zrender/src/core/util';
import { Dictionary } from 'zrender/src/core/types';
import List from './List';
import Model from '../model/Model';
import Element from 'zrender/src/Element';
import { DimensionLoose, ParsedValue } from '../util/types';

// id may be function name of Object, add a prefix to avoid this problem.
function generateNodeKey(id: string): string {
    return '_EC_' + id;
}

class Graph {
    type: 'graph' = 'graph'

    readonly nodes: GraphNode[] = [];

    readonly edges: GraphEdge[] = [];

    data: List

    edgeData: List

    /**
     * 是否是有向图
     */
    private _directed: boolean

    private _nodesMap: Dictionary<GraphNode> = {};
    /**
     * @type {Object.<string, module:echarts/data/Graph.Edge>}
     * @private
     */
    private _edgesMap: Dictionary<GraphEdge> = {};


    constructor(directed?: boolean) {
        this._directed = directed || false;
    }

    /**
     * If is directed graph
     */
    isDirected(): boolean {
        return this._directed;
    };

    /**
     * Add a new node
     */
    addNode(id: string, dataIndex?: number): GraphNode {
        id = id == null ? ('' + dataIndex) : ('' + id);

        var nodesMap = this._nodesMap;

        if (nodesMap[generateNodeKey(id)]) {
            if (__DEV__) {
                console.error('Graph nodes have duplicate name or id');
            }
            return;
        }

        var node = new GraphNode(id, dataIndex);
        node.hostGraph = this;

        this.nodes.push(node);

        nodesMap[generateNodeKey(id)] = node;
        return node;
    };

    /**
     * Get node by data index
     */
    getNodeByIndex(dataIndex: number): GraphNode {
        var rawIdx = this.data.getRawIndex(dataIndex);
        return this.nodes[rawIdx];
    };
    /**
     * Get node by id
     */
    getNodeById(id: string): GraphNode {
        return this._nodesMap[generateNodeKey(id)];
    };

    /**
     * Add a new edge
     */
    addEdge(n1: GraphNode | number | string, n2: GraphNode | number | string, dataIndex?: number) {
        var nodesMap = this._nodesMap;
        var edgesMap = this._edgesMap;

        // PNEDING
        if (typeof n1 === 'number') {
            n1 = this.nodes[n1];
        }
        if (typeof n2 === 'number') {
            n2 = this.nodes[n2];
        }

        if (!(n1 instanceof GraphNode)) {
            n1 = nodesMap[generateNodeKey(n1)];
        }
        if (!(n2 instanceof GraphNode)) {
            n2 = nodesMap[generateNodeKey(n2)];
        }
        if (!n1 || !n2) {
            return;
        }

        var key = n1.id + '-' + n2.id;
        // PENDING
        if (edgesMap[key]) {
            return;
        }

        var edge = new GraphEdge(n1, n2, dataIndex);
        edge.hostGraph = this;

        if (this._directed) {
            n1.outEdges.push(edge);
            n2.inEdges.push(edge);
        }
        n1.edges.push(edge);
        if (n1 !== n2) {
            n2.edges.push(edge);
        }

        this.edges.push(edge);
        edgesMap[key] = edge;

        return edge;
    };

    /**
     * Get edge by data index
     */
    getEdgeByIndex(dataIndex: number): GraphEdge {
        var rawIdx = this.edgeData.getRawIndex(dataIndex);
        return this.edges[rawIdx];
    };
    /**
     * Get edge by two linked nodes
     */
    getEdge(n1: string | GraphNode, n2: string | GraphNode): GraphEdge {
        if (n1 instanceof GraphNode) {
            n1 = n1.id;
        }
        if (n2 instanceof GraphNode) {
            n2 = n2.id;
        }

        var edgesMap = this._edgesMap;

        if (this._directed) {
            return edgesMap[n1 + '-' + n2];
        }
        else {
            return edgesMap[n1 + '-' + n2]
                || edgesMap[n2 + '-' + n1];
        }
    };

    /**
     * Iterate all nodes
     */
    eachNode<Ctx>(
        cb: (this: Ctx, node: GraphNode, idx: number) => void,
        context?: Ctx
    ) {
        var nodes = this.nodes;
        var len = nodes.length;
        for (var i = 0; i < len; i++) {
            if (nodes[i].dataIndex >= 0) {
                cb.call(context, nodes[i], i);
            }
        }
    };

    /**
     * Iterate all edges
     */
    eachEdge<Ctx>(
        cb: (this: Ctx, edge: GraphEdge, idx: number) => void,
        context?: Ctx
    ) {
        var edges = this.edges;
        var len = edges.length;
        for (var i = 0; i < len; i++) {
            if (edges[i].dataIndex >= 0
                && edges[i].node1.dataIndex >= 0
                && edges[i].node2.dataIndex >= 0
            ) {
                cb.call(context, edges[i], i);
            }
        }
    };

    /**
     * Breadth first traverse
     * Return true to stop traversing
     */
    breadthFirstTraverse<Ctx>(
        cb: (this: Ctx, node: GraphNode, fromNode: GraphNode) => boolean,
        startNode: GraphNode | string,
        direction: 'none' | 'in' | 'out',
        context?: Ctx
    ) {
        if (!(startNode instanceof GraphNode)) {
            startNode = this._nodesMap[generateNodeKey(startNode)];
        }
        if (!startNode) {
            return;
        }

        var edgeType: 'inEdges' | 'outEdges' | 'edges' = direction === 'out'
            ? 'outEdges' : (direction === 'in' ? 'inEdges' : 'edges');

        for (var i = 0; i < this.nodes.length; i++) {
            this.nodes[i].__visited = false;
        }

        if (cb.call(context, startNode, null)) {
            return;
        }

        var queue = [startNode];
        while (queue.length) {
            var currentNode = queue.shift();
            var edges = currentNode[edgeType];

            for (var i = 0; i < edges.length; i++) {
                var e = edges[i];
                var otherNode = e.node1 === currentNode
                    ? e.node2 : e.node1;
                if (!otherNode.__visited) {
                    if (cb.call(context, otherNode, currentNode)) {
                        // Stop traversing
                        return;
                    }
                    queue.push(otherNode);
                    otherNode.__visited = true;
                }
            }
        }
    };

    // TODO
    // depthFirstTraverse(
    //     cb, startNode, direction, context
    // ) {

    // };

    // Filter update
    update() {
        var data = this.data;
        var edgeData = this.edgeData;
        var nodes = this.nodes;
        var edges = this.edges;

        for (var i = 0, len = nodes.length; i < len; i++) {
            nodes[i].dataIndex = -1;
        }
        for (var i = 0, len = data.count(); i < len; i++) {
            nodes[data.getRawIndex(i)].dataIndex = i;
        }

        edgeData.filterSelf(function (idx) {
            var edge = edges[edgeData.getRawIndex(idx)];
            return edge.node1.dataIndex >= 0 && edge.node2.dataIndex >= 0;
        });

        // Update edge
        for (var i = 0, len = edges.length; i < len; i++) {
            edges[i].dataIndex = -1;
        }
        for (var i = 0, len = edgeData.count(); i < len; i++) {
            edges[edgeData.getRawIndex(i)].dataIndex = i;
        }
    };

    /**
     * @return {module:echarts/data/Graph}
     */
    clone() {
        var graph = new Graph(this._directed);
        var nodes = this.nodes;
        var edges = this.edges;
        for (var i = 0; i < nodes.length; i++) {
            graph.addNode(nodes[i].id, nodes[i].dataIndex);
        }
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            graph.addEdge(e.node1.id, e.node2.id, e.dataIndex);
        }
        return graph;
    };

    static Node: typeof GraphNode
    static Edge: typeof GraphEdge

}


class GraphNode {

    id: string

    inEdges: GraphEdge[] = []

    outEdges: GraphEdge[] = []

    edges: GraphEdge[] = [];

    hostGraph: Graph

    dataIndex: number = -1

    // Used in traverse of Graph
    __visited: boolean

    constructor(id?: string, dataIndex?: number) {
        this.id = id == null ? '' : id;
        this.dataIndex = dataIndex == null ? -1 : dataIndex;
    }

    /**
     * @return {number}
     */
    degree() {
        return this.edges.length;
    }

    /**
     * @return {number}
     */
    inDegree() {
        return this.inEdges.length;
    }

    /**
    * @return {number}
    */
    outDegree() {
        return this.outEdges.length;
    }

    // TODO: TYPE Same type with Model#getModel
    getModel(path: string | string[]): Model {
        if (this.dataIndex < 0) {
            return;
        }
        var graph = this.hostGraph;
        var itemModel = graph.data.getItemModel(this.dataIndex);

        return itemModel.getModel(path as [string]);
    }
}


class GraphEdge {
    /**
     * 节点1，如果是有向图则为源节点
     */
    node1: GraphNode
    /**
     * 节点2，如果是有向图则为目标节点
     */
    node2: GraphNode

    dataIndex: number = -1

    hostGraph: Graph

    constructor(n1: GraphNode, n2: GraphNode, dataIndex?: number) {
        this.node1 = n1;
        this.node2 = n2;
        this.dataIndex = dataIndex == null ? -1 : dataIndex;
    }

    getModel(path: string | string[]): Model {
        if (this.dataIndex < 0) {
            return;
        }
        var graph = this.hostGraph;
        var itemModel = graph.edgeData.getItemModel(this.dataIndex);

        return itemModel.getModel(path as [string]);
    }
}

type GetDataName<Host> = Host extends GraphEdge ? 'edgeData' : 'data';

function createGraphDataProxyMixin<Host extends GraphEdge | GraphNode>(
    hostName: 'hostGraph',
    dataName: GetDataName<Host>
) {
    return {
        /**
         * @param Default 'value'. can be 'a', 'b', 'c', 'd', 'e'.
         */
        getValue: function (this: Host, dimension: DimensionLoose): ParsedValue {
            var data = this[hostName][dataName];
            return data.get(data.getDimension(dimension || 'value'), this.dataIndex);
        },

        setVisual: function (this: Host, key: string | Dictionary<any>, value?: any) {
            this.dataIndex >= 0
                && this[hostName][dataName].setItemVisual(this.dataIndex, key as string, value);
        },

        getVisual: function (this: Host, key: string, ignoreParent?: boolean) {
            return this[hostName][dataName].getItemVisual(this.dataIndex, key, ignoreParent);
        },

        setLayout: function (this: Host, layout: any, merge?: boolean) {
            this.dataIndex >= 0
                && this[hostName][dataName].setItemLayout(this.dataIndex, layout, merge);
        },

        getLayout: function (this: Host) {
            return this[hostName][dataName].getItemLayout(this.dataIndex);
        },

        getGraphicEl: function (this: Host): Element {
            return this[hostName][dataName].getItemGraphicEl(this.dataIndex);
        },

        getRawIndex: function (this: Host) {
            return this[hostName][dataName].getRawIndex(this.dataIndex);
        }
    };
};


interface GraphEdge extends ReturnType<typeof createGraphDataProxyMixin> {};
interface GraphNode extends ReturnType<typeof createGraphDataProxyMixin> {};

zrUtil.mixin(GraphEdge, createGraphDataProxyMixin('hostGraph', 'data'));
zrUtil.mixin(GraphNode, createGraphDataProxyMixin('hostGraph', 'edgeData'));

Graph.Node = GraphNode;
Graph.Edge = GraphEdge;


export default Graph;