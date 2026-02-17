'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faTimes, faChartSimple } from '@fortawesome/free-solid-svg-icons';

type ChartDatum = Record<string, number | string | null>;

interface ChartData {
    title?: string;
    type: 'bar' | 'line' | 'area' | 'pie';
    data: ChartDatum[];
    xAxisKey: string;
    dataKeys: string[];
}

interface ChartRendererProps {
    config: ChartData;
}

const COLORS = ['#0088fe', '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00c49f'];

export const ChartRenderer: React.FC<ChartRendererProps> = ({ config }) => {
    const { title, type, data, xAxisKey, dataKeys } = config;
    const [isOpen, setIsOpen] = useState(false);
    const canUseDOM = typeof window !== "undefined";

    const renderChart = (inModal: boolean = false) => {
        const fontSize = inModal ? 12 : 10;
        const strokeColor = "#666";

        // Common props for charts
        const commonGrid = <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />;
        const commonXAxis = <XAxis dataKey={xAxisKey} stroke={strokeColor} fontSize={fontSize} tickLine={false} axisLine={false} dy={10} />;
        const commonYAxis = <YAxis stroke={strokeColor} fontSize={fontSize} tickLine={false} axisLine={false} dx={-10} />;
        const commonTooltip = (
            <Tooltip
                contentStyle={{
                    backgroundColor: '#1c1c1e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                }}
                itemStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            />
        );
        const commonLegend = <Legend wrapperStyle={{ paddingTop: '20px' }} />;

        switch (type) {
            case 'bar':
                return (
                    <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        {commonGrid}
                        {commonXAxis}
                        {commonYAxis}
                        {commonTooltip}
                        {commonLegend}
                        {dataKeys.map((key, index) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={COLORS[index % COLORS.length]}
                                radius={[4, 4, 0, 0]}
                                animationDuration={1000}
                            />
                        ))}
                    </BarChart>
                );
            case 'line':
                return (
                    <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        {commonGrid}
                        {commonXAxis}
                        {commonYAxis}
                        {commonTooltip}
                        {commonLegend}
                        {dataKeys.map((key, index) => (
                            <Line
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stroke={COLORS[index % COLORS.length]}
                                strokeWidth={3}
                                dot={{ fill: '#1c1c1e', strokeWidth: 2, r: 4 }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                                animationDuration={1000}
                            />
                        ))}
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            {dataKeys.map((key, index) => (
                                <linearGradient key={`color-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        {commonGrid}
                        {commonXAxis}
                        {commonYAxis}
                        {commonTooltip}
                        {commonLegend}
                        {dataKeys.map((key, index) => (
                            <Area
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stroke={COLORS[index % COLORS.length]}
                                fillOpacity={1}
                                fill={`url(#color-${key})`}
                                strokeWidth={3}
                                animationDuration={1000}
                            />
                        ))}
                    </AreaChart>
                );
            case 'pie':
                return (
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={inModal ? 80 : 60}
                            outerRadius={inModal ? 120 : 80}
                            paddingAngle={5}
                            dataKey={dataKeys[0]}
                            nameKey={xAxisKey}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                            ))}
                        </Pie>
                        {commonTooltip}
                        {commonLegend}
                    </PieChart>
                );
            default:
                return <div className="text-white/50 text-center">Unsupported chart type: {type}</div>;
        }
    };

    return (
        <>
            {/* Chart Card */}
            <div className="w-full my-3 bg-white/10 p-4 rounded-2xl border border-white/20 font-sans">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                            <FontAwesomeIcon icon={faChartSimple} />
                        </div>
                        <div>
                            <p className="text-white text-[14px] font-semibold">{type.charAt(0).toUpperCase() + type.slice(1)} Chart</p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsOpen(true);
                    }}
                    className="w-full py-2.5 bg-[#0098EA] hover:bg-[#0087d1] active:scale-[0.98] transition-all rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                    <FontAwesomeIcon icon={faExpand} />
                    <span>Open</span>
                </button>
            </div>

            {/* Full Screen Modal */}
            {isOpen && canUseDOM && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsOpen(false);
                    }}
                >
                    <div
                        className="relative bg-[#1c1c1e] w-full max-w-5xl aspect-square md:aspect-video rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-white/10 font-sans"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/5">
                            <div>
                                <h2 className="text-[18px] font-bold text-white ml-2">{title || 'Data Visualization'}</h2>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen(false);
                                }}
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-colors cursor-pointer"
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>

                        {/* Chart Area */}
                        <div className="flex-1 w-full p-6 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                {renderChart(true)}
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
