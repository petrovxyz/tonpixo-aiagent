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

const CHART_SERIES_COLORS = [
    'var(--chart-series-1)',
    'var(--chart-series-2)',
    'var(--chart-series-3)',
    'var(--chart-series-4)',
    'var(--chart-series-5)',
    'var(--chart-series-6)',
];

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
});
const INTEGER_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
});
const DECIMAL_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

const formatAxisValue = (value: number | string): string => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return String(value);
    }

    const abs = Math.abs(numeric);
    if (abs >= 1000) {
        return COMPACT_NUMBER_FORMATTER.format(numeric);
    }
    if (abs >= 1) {
        return INTEGER_NUMBER_FORMATTER.format(numeric);
    }
    if (abs === 0) {
        return '0';
    }

    return DECIMAL_NUMBER_FORMATTER.format(numeric);
};

const formatTooltipValue = (value: number | string): string => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return String(value);
    }

    return DECIMAL_NUMBER_FORMATTER.format(numeric);
};

const formatTooltipKey = (key: string | number | undefined): string =>
    key === undefined ? '' : String(key).replaceAll('_', ' ');

export const ChartRenderer: React.FC<ChartRendererProps> = ({ config }) => {
    const { title, type, data, xAxisKey, dataKeys } = config;
    const [isOpen, setIsOpen] = useState(false);
    const canUseDOM = typeof window !== 'undefined';

    const renderChart = (inModal: boolean = false) => {
        const fontSize = inModal ? 12 : 10;
        const axisColor = 'var(--chart-axis-color)';
        const chartMargin = inModal
            ? { top: 10, right: 16, left: 8, bottom: 0 }
            : { top: 10, right: 12, left: 4, bottom: 0 };

        const commonGrid = <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-color)" vertical={false} />;
        const commonXAxis = (
            <XAxis
                dataKey={xAxisKey}
                stroke={axisColor}
                fontSize={fontSize}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={inModal ? 24 : 16}
            />
        );
        const commonYAxis = (
            <YAxis
                stroke={axisColor}
                fontSize={fontSize}
                tickLine={false}
                axisLine={false}
                width={inModal ? 68 : 60}
                tickMargin={8}
                tickFormatter={(value) => formatAxisValue(value as number | string)}
            />
        );
        const commonTooltip = (
            <Tooltip
                contentStyle={{
                    backgroundColor: 'var(--chart-tooltip-bg)',
                    border: '1px solid var(--chart-tooltip-border)',
                    borderRadius: '12px',
                    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
                    color: 'var(--chart-tooltip-text)',
                }}
                itemStyle={{ color: 'var(--chart-tooltip-text)' }}
                labelStyle={{ color: 'var(--chart-tooltip-label)', fontWeight: 600 }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                formatter={(value, name) => [formatTooltipValue(value as number | string), formatTooltipKey(name)]}
            />
        );
        const commonLegend = (
            <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value) => <span style={{ color: 'var(--chart-legend-text)' }}>{String(value)}</span>}
            />
        );

        switch (type) {
            case 'bar':
                return (
                    <BarChart data={data} margin={chartMargin}>
                        {commonGrid}
                        {commonXAxis}
                        {commonYAxis}
                        {commonTooltip}
                        {commonLegend}
                        {dataKeys.map((key, index) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
                                radius={[4, 4, 0, 0]}
                                animationDuration={1000}
                            />
                        ))}
                    </BarChart>
                );
            case 'line':
                return (
                    <LineChart data={data} margin={chartMargin}>
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
                                stroke={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
                                strokeWidth={3}
                                dot={{ fill: 'var(--chart-modal-bg)', strokeWidth: 2, r: 4 }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                                animationDuration={1000}
                            />
                        ))}
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={data} margin={chartMargin}>
                        <defs>
                            {dataKeys.map((key, index) => (
                                <linearGradient key={`color-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]} stopOpacity={0} />
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
                                stroke={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
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
                                <Cell
                                    key={`cell-${index}`}
                                    fill={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
                                    stroke="rgba(0,0,0,0)"
                                />
                            ))}
                        </Pie>
                        {commonTooltip}
                        {commonLegend}
                    </PieChart>
                );
            default:
                return <div className="text-white/60 text-center">Unsupported chart type: {type}</div>;
        }
    };

    return (
        <>
            <div className="w-full my-3 p-4 rounded-2xl border font-sans bg-[var(--chart-card-bg)] border-[var(--chart-card-border)]">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--chart-icon-bg)] flex items-center justify-center text-[var(--chart-card-text)]">
                            <FontAwesomeIcon icon={faChartSimple} />
                        </div>
                        <div>
                            <p className="text-[14px] font-semibold text-[var(--chart-card-text)]">{type.charAt(0).toUpperCase() + type.slice(1)} Chart</p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsOpen(true);
                    }}
                    className="w-full py-2.5 bg-[var(--chart-button-bg)] hover:bg-[var(--chart-button-bg-hover)] active:scale-[0.98] transition-all rounded-xl text-[var(--chart-button-text)] font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                    <FontAwesomeIcon icon={faExpand} />
                    <span>Open</span>
                </button>
            </div>

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
                        className="relative w-full max-w-5xl aspect-square md:aspect-video rounded-3xl overflow-hidden shadow-2xl flex flex-col border font-sans bg-[var(--chart-modal-bg)] border-[var(--chart-modal-border)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-[var(--chart-modal-divider)]">
                            <div>
                                <h2 className="text-[18px] font-bold ml-2 text-[var(--chart-title-color)]">{title || 'Data Visualization'}</h2>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen(false);
                                }}
                                className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity opacity-70 hover:opacity-100 cursor-pointer"
                                style={{ color: 'var(--chart-close-color)' }}
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>

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
