'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faTimes, faChartSimple } from '@fortawesome/free-solid-svg-icons';

type Primitive = number | string | boolean | null;
type ChartDatum = Record<string, Primitive>;
type PlotlyTrace = Record<string, unknown>;

interface LegacyChartData {
    title?: string;
    type: 'bar' | 'line' | 'area' | 'pie';
    data: ChartDatum[];
    xAxisKey: string;
    dataKeys: string[];
}

interface PlotlyPayload {
    format?: string;
    title?: string;
    figure?: {
        data?: unknown[];
        layout?: Record<string, unknown>;
        frames?: unknown[];
    };
    config?: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

interface NormalizedChart {
    title: string;
    chartType: string;
    figureData: PlotlyTrace[];
    figureLayout: Record<string, unknown>;
    figureConfig: Record<string, unknown>;
}

interface ChartRendererProps {
    config: PlotlyPayload | LegacyChartData;
}

const Plot = dynamic(async () => {
    const createPlotlyComponent = (await import('react-plotly.js/factory')).default;
    const plotly = (await import('plotly.js-basic-dist-min')).default;
    return createPlotlyComponent(plotly);
}, { ssr: false });

const CHART_SERIES_COLORS = [
    '#4cb8ff',
    '#67dcb0',
    '#ffcb6b',
    '#ff8faa',
    '#a4b2ff',
    '#66e5ff',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isLegacyChartData = (value: unknown): value is LegacyChartData => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.type === 'string' &&
        Array.isArray(value.data) &&
        typeof value.xAxisKey === 'string' &&
        Array.isArray(value.dataKeys)
    );
};

const toNumber = (value: Primitive): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const compact = value.replaceAll(',', '').trim();
        if (!compact) {
            return 0;
        }
        const parsed = Number(compact);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    return 0;
};

const humanize = (value: string): string => {
    const compact = value.replaceAll('_', ' ').trim();
    if (!compact) {
        return 'Series';
    }
    return compact.charAt(0).toUpperCase() + compact.slice(1);
};

const hexToRgba = (hex: string, alpha: number): string => {
    const normalized = hex.replace('#', '');
    if (normalized.length !== 6) {
        return `rgba(76, 184, 255, ${alpha})`;
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const deepMerge = (
    base: Record<string, unknown>,
    override: Record<string, unknown>,
): Record<string, unknown> => {
    const merged: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(override)) {
        const existing = merged[key];
        if (isRecord(existing) && isRecord(value)) {
            merged[key] = deepMerge(existing, value);
            continue;
        }
        merged[key] = value;
    }

    return merged;
};

const readTitleFromLayout = (layout: Record<string, unknown> | undefined): string => {
    if (!layout) {
        return '';
    }
    const rawTitle = layout.title;
    if (typeof rawTitle === 'string') {
        return rawTitle;
    }
    if (isRecord(rawTitle) && typeof rawTitle.text === 'string') {
        return rawTitle.text;
    }
    return '';
};

const stripPlotTitle = (layout: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...layout };
    next.title = { text: '' };
    return next;
};

const buildLegacyFigure = (legacy: LegacyChartData): Pick<NormalizedChart, 'figureData' | 'figureLayout'> => {
    const xValues = legacy.data.map((row) => row[legacy.xAxisKey]);

    if (legacy.type === 'pie') {
        const metric = legacy.dataKeys[0] ?? '';
        const labels = xValues.map((value) => String(value ?? ''));
        const values = legacy.data.map((row) => toNumber(row[metric] ?? 0));

        return {
            figureData: [
                {
                    type: 'pie',
                    name: humanize(metric),
                    labels,
                    values,
                    hole: 0.44,
                    textinfo: 'percent+label',
                    textposition: 'outside',
                    marker: {
                        colors: labels.map((_, index) => CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]),
                        line: { color: 'rgba(17, 35, 61, 0.95)', width: 1.3 },
                    },
                    hovertemplate: '%{label}<br>%{value:,.2f} (%{percent})<extra></extra>',
                },
            ],
            figureLayout: {},
        };
    }

    const figureData = legacy.dataKeys.map((key, index) => {
        const color = CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
        const yValues = legacy.data.map((row) => toNumber(row[key] ?? 0));
        const name = humanize(key);

        if (legacy.type === 'bar') {
            return {
                type: 'bar',
                name,
                x: xValues,
                y: yValues,
                marker: { color, line: { width: 0 }, cornerradius: 10 },
                opacity: 0.95,
                hovertemplate: `%{x}<br>${name}: %{y:,.2f}<extra></extra>`,
            };
        }

        if (legacy.type === 'line') {
            return {
                type: 'scatter',
                mode: 'lines+markers',
                name,
                x: xValues,
                y: yValues,
                line: { color, width: 3, shape: 'spline', smoothing: 0.45 },
                marker: { color, size: 6, line: { color: 'rgba(17,35,61,0.95)', width: 1.2 } },
                hovertemplate: `%{x}<br>${name}: %{y:,.2f}<extra></extra>`,
            };
        }

        return {
            type: 'scatter',
            mode: 'lines',
            name,
            x: xValues,
            y: yValues,
            line: { color, width: 2.8, shape: 'spline', smoothing: 0.35 },
            stackgroup: 'tonpixo_area',
            fill: index > 0 ? 'tonexty' : 'tozeroy',
            fillcolor: hexToRgba(color, 0.2),
            hovertemplate: `%{x}<br>${name}: %{y:,.2f}<extra></extra>`,
        };
    });

    return {
        figureData,
        figureLayout: {},
    };
};

const normalizeTracesForDisplay = (input: PlotlyTrace[]): PlotlyTrace[] =>
    input.map((trace, index) => {
        if (!isRecord(trace)) {
            return trace;
        }

        const next: PlotlyTrace = { ...trace };
        const traceType = String(trace.type || '').toLowerCase();
        const color = CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];

        if (traceType === 'bar') {
            const marker = isRecord(trace.marker) ? { ...trace.marker } : {};
            marker.color = marker.color ?? color;
            marker.line = isRecord(marker.line) ? { ...marker.line, width: 0 } : { width: 0 };
            marker.cornerradius = marker.cornerradius ?? 10;
            next.marker = marker;
            next.opacity = next.opacity ?? 0.95;
        }

        return next;
    });

const baseLayout = (inModal: boolean): Record<string, unknown> => ({
    font: { color: '#dce6f9', size: inModal ? 13 : 12, family: 'Inter, system-ui, sans-serif' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(12, 21, 34, 0.62)',
    margin: inModal
        ? { l: 68, r: 30, t: 24, b: 112, pad: 8 }
        : { l: 50, r: 16, t: 8, b: 90, pad: 6 },
    bargap: 0.22,
    barcornerradius: 10,
    hovermode: 'x unified',
    showlegend: false,
    legend: {
        orientation: 'h',
        x: 0,
        y: -0.2,
        xanchor: 'left',
        yanchor: 'top',
        font: { color: '#dce6f9', size: 11 },
    },
    xaxis: {
        type: 'category',
        tickfont: { color: '#c7d4eb', size: inModal ? 12 : 11 },
        showgrid: false,
        zeroline: false,
        showline: false,
        tickangle: inModal ? -24 : -34,
        ticklabeloverflow: 'allow',
        nticks: inModal ? 12 : 8,
        automargin: true,
        title: {
            standoff: 14,
            font: { color: '#aebad0', size: inModal ? 12 : 11 },
        },
    },
    yaxis: {
        tickfont: { color: '#c7d4eb', size: inModal ? 12 : 11 },
        gridcolor: 'rgba(177,198,226,0.20)',
        gridwidth: 1,
        zeroline: false,
        automargin: true,
        tickformat: ',~s',
        nticks: inModal ? 8 : 7,
        title: {
            standoff: 12,
            font: { color: '#aebad0', size: inModal ? 12 : 11 },
        },
    },
    hoverlabel: {
        bgcolor: '#121925',
        bordercolor: 'rgba(177,198,226,0.32)',
        font: { color: '#f3f7ff', size: inModal ? 12 : 11 },
    },
    autosize: true,
});

const baseConfig: Record<string, unknown> = {
    responsive: true,
    displaylogo: false,
    displayModeBar: false,
    scrollZoom: false,
};

const normalizeChart = (config: PlotlyPayload | LegacyChartData): NormalizedChart => {
    if (isLegacyChartData(config)) {
        const legacyFigure = buildLegacyFigure(config);
        return {
            title: String(config.title || 'Data visualization'),
            chartType: config.type,
            figureData: legacyFigure.figureData,
            figureLayout: legacyFigure.figureLayout,
            figureConfig: {},
        };
    }

    const figure = isRecord(config.figure) ? config.figure : {};
    const rawFigureData = Array.isArray(figure.data) ? figure.data : [];
    const figureData = rawFigureData.filter((trace): trace is PlotlyTrace => isRecord(trace));
    const figureLayout = isRecord(figure.layout) ? figure.layout : {};
    const title =
        String(config.title || '').trim() ||
        readTitleFromLayout(figureLayout) ||
        'Data visualization';

    const chartType =
        isRecord(config.meta) && typeof config.meta.chartType === 'string'
            ? String(config.meta.chartType)
            : 'chart';

    return {
        title,
        chartType,
        figureData,
        figureLayout,
        figureConfig: isRecord(config.config) ? config.config : {},
    };
};

export const ChartRenderer: React.FC<ChartRendererProps> = ({ config }) => {
    const [isOpen, setIsOpen] = useState(false);
    const canUseDOM = typeof window !== 'undefined';

    const chart = useMemo(() => normalizeChart(config), [config]);

    const renderPlot = (inModal: boolean) => {
        if (!chart.figureData.length) {
            return (
                <div className="h-full flex items-center justify-center text-sm text-white/70 text-center px-4">
                    Chart payload is empty.
                </div>
            );
        }

        const data = normalizeTracesForDisplay(chart.figureData);
        const layout = stripPlotTitle(deepMerge(baseLayout(inModal), chart.figureLayout));
        const hasLegend = data.length > 1 && data.some((trace) => typeof trace.name === 'string' && String(trace.name).trim().length > 0);
        layout.showlegend = hasLegend;

        return (
            <Plot
                data={data as never[]}
                layout={layout}
                config={{ ...chart.figureConfig, ...baseConfig }}
                useResizeHandler
                style={{ width: '100%', height: '100%' }}
                className="w-full h-full"
            />
        );
    };

    return (
        <>
            <div className="w-full my-3 p-4 sm:p-5 rounded-2xl border font-sans bg-[var(--chart-card-bg)] border-[var(--chart-card-border)]">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--chart-icon-bg)] flex items-center justify-center text-[var(--chart-card-text)] shrink-0">
                        <FontAwesomeIcon icon={faChartSimple} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-[var(--chart-card-text)] overflow-hidden text-ellipsis whitespace-nowrap">
                            {chart.title}
                        </p>
                        <p className="text-[12px] text-white/65 capitalize overflow-hidden text-ellipsis whitespace-nowrap">
                            {chart.chartType}
                        </p>
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
                    <span>Open chart</span>
                </button>
            </div>

            {isOpen && canUseDOM && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsOpen(false);
                    }}
                >
                    <div
                        className="relative w-full max-w-6xl h-[84dvh] sm:h-[80vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border font-sans bg-[var(--chart-modal-bg)] border-[var(--chart-modal-border)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--chart-modal-divider)]">
                            <div className="min-w-0 flex-1">
                                <h2 className="text-[16px] sm:text-[18px] font-bold text-[var(--chart-title-color)] overflow-hidden text-ellipsis whitespace-nowrap">
                                    {chart.title}
                                </h2>
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

                        <div className="flex-1 w-full p-4 sm:p-7 min-h-0">
                            {renderPlot(true)}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
