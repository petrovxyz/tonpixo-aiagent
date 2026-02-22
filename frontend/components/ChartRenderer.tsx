'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faTimes, faChartSimple } from '@fortawesome/free-solid-svg-icons';

type Primitive = number | string | boolean | null;
type ChartDatum = Record<string, Primitive>;

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
    subtitle: string;
    figureData: unknown[];
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
    '#2ea8ff',
    '#ffbf47',
    '#33d6a6',
    '#ff6b8b',
    '#9f8bff',
    '#23d4ff',
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
        return `rgba(46, 168, 255, ${alpha})`;
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildLegacyFigure = (legacy: LegacyChartData): Pick<NormalizedChart, 'figureData' | 'figureLayout' | 'subtitle'> => {
    const xValues = legacy.data.map((row) => row[legacy.xAxisKey]);
    const subtitle = `${legacy.type.charAt(0).toUpperCase()}${legacy.type.slice(1)} chart`;

    if (legacy.type === 'pie') {
        const metric = legacy.dataKeys[0] ?? '';
        const labels = xValues.map((value) => String(value ?? ''));
        const values = legacy.data.map((row) => toNumber(row[metric] ?? 0));

        return {
            subtitle,
            figureData: [
                {
                    type: 'pie',
                    name: humanize(metric),
                    labels,
                    values,
                    hole: 0.46,
                    textinfo: 'percent+label',
                    textposition: 'outside',
                    marker: {
                        colors: labels.map((_, index) => CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]),
                        line: { color: 'rgba(21,28,40,0.95)', width: 1.25 },
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
                marker: { color },
                opacity: 0.92,
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
                line: { color, width: 2.8, shape: 'spline', smoothing: 0.45 },
                marker: { color, size: 6, line: { color: 'rgba(21,28,40,0.95)', width: 1.2 } },
                hovertemplate: `%{x}<br>${name}: %{y:,.2f}<extra></extra>`,
            };
        }

        return {
            type: 'scatter',
            mode: 'lines',
            name,
            x: xValues,
            y: yValues,
            line: { color, width: 2.6, shape: 'spline', smoothing: 0.35 },
            stackgroup: 'tonpixo_area',
            fill: index > 0 ? 'tonexty' : 'tozeroy',
            fillcolor: hexToRgba(color, 0.18),
            hovertemplate: `%{x}<br>${name}: %{y:,.2f}<extra></extra>`,
        };
    });

    return {
        subtitle,
        figureData,
        figureLayout: {},
    };
};

const baseLayout = (title: string, inModal: boolean): Record<string, unknown> => ({
    title: {
        text: title,
        x: 0.02,
        xanchor: 'left',
        font: { color: '#f5f8ff', size: inModal ? 20 : 16, family: 'Inter, system-ui, sans-serif' },
    },
    font: { color: '#dce6f9', size: inModal ? 12 : 11, family: 'Inter, system-ui, sans-serif' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(21,28,40,0.38)',
    margin: inModal
        ? { l: 56, r: 22, t: 72, b: 58, pad: 8 }
        : { l: 42, r: 16, t: 52, b: 42, pad: 6 },
    legend: {
        orientation: 'h',
        x: 0,
        y: -0.2,
        xanchor: 'left',
        yanchor: 'top',
        font: { color: '#dce6f9', size: 11 },
    },
    hovermode: 'x unified',
    xaxis: {
        tickfont: { color: '#aebad0', size: 11 },
        showgrid: false,
        zeroline: false,
        showline: false,
        automargin: true,
        ticklabeloverflow: 'hide past div',
    },
    yaxis: {
        tickfont: { color: '#aebad0', size: 11 },
        gridcolor: 'rgba(174,186,208,0.22)',
        zeroline: false,
        automargin: true,
        tickformat: ',~s',
    },
    hoverlabel: {
        bgcolor: '#121925',
        bordercolor: 'rgba(177,198,226,0.26)',
        font: { color: '#f3f7ff', size: 12 },
    },
    autosize: true,
});

const baseConfig: Record<string, unknown> = {
    responsive: true,
    displaylogo: false,
    scrollZoom: false,
    modeBarButtonsToRemove: [
        'lasso2d',
        'select2d',
        'autoScale2d',
        'zoomIn2d',
        'zoomOut2d',
        'hoverClosestCartesian',
        'hoverCompareCartesian',
        'toggleSpikelines',
    ],
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

const normalizeChart = (config: PlotlyPayload | LegacyChartData): NormalizedChart => {
    if (isLegacyChartData(config)) {
        const legacyFigure = buildLegacyFigure(config);
        return {
            title: String(config.title || 'Data visualization'),
            subtitle: legacyFigure.subtitle,
            figureData: legacyFigure.figureData,
            figureLayout: legacyFigure.figureLayout,
            figureConfig: {},
        };
    }

    const figure = isRecord(config.figure) ? config.figure : {};
    const figureData = Array.isArray(figure.data) ? figure.data : [];
    const figureLayout = isRecord(figure.layout) ? figure.layout : {};
    const title =
        String(config.title || '').trim() ||
        readTitleFromLayout(figureLayout) ||
        'Data visualization';

    const chartType =
        isRecord(config.meta) && typeof config.meta.chartType === 'string'
            ? String(config.meta.chartType)
            : 'Chart';

    return {
        title,
        subtitle: `${chartType.charAt(0).toUpperCase()}${chartType.slice(1)} chart`,
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

        return (
            <Plot
                data={chart.figureData as never[]}
                layout={{ ...baseLayout(chart.title, inModal), ...chart.figureLayout }}
                config={{ ...baseConfig, ...chart.figureConfig }}
                useResizeHandler
                style={{ width: '100%', height: '100%' }}
                className="w-full h-full"
            />
        );
    };

    return (
        <>
            <div className="w-full my-3 p-4 sm:p-5 rounded-2xl border font-sans bg-[var(--chart-card-bg)] border-[var(--chart-card-border)]">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--chart-icon-bg)] flex items-center justify-center text-[var(--chart-card-text)] shrink-0">
                            <FontAwesomeIcon icon={faChartSimple} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-[var(--chart-card-text)] truncate">{chart.title}</p>
                            <p className="text-[12px] text-white/70 truncate">{chart.subtitle}</p>
                        </div>
                    </div>
                </div>

                <div className="w-full h-[250px] sm:h-[300px] rounded-xl border border-white/8 overflow-hidden bg-[rgba(8,12,18,0.28)]">
                    {renderPlot(false)}
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsOpen(true);
                    }}
                    className="mt-4 w-full py-2.5 bg-[var(--chart-button-bg)] hover:bg-[var(--chart-button-bg-hover)] active:scale-[0.98] transition-all rounded-xl text-[var(--chart-button-text)] font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                    <FontAwesomeIcon icon={faExpand} />
                    <span>Open Full Chart</span>
                </button>
            </div>

            {isOpen && canUseDOM && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsOpen(false);
                    }}
                >
                    <div
                        className="relative w-full max-w-6xl aspect-[16/11] sm:aspect-video rounded-3xl overflow-hidden shadow-2xl flex flex-col border font-sans bg-[var(--chart-modal-bg)] border-[var(--chart-modal-border)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--chart-modal-divider)]">
                            <h2 className="text-[16px] sm:text-[18px] font-bold text-[var(--chart-title-color)] truncate pr-3">{chart.title}</h2>
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

                        <div className="flex-1 w-full p-3 sm:p-6 min-h-0">
                            {renderPlot(true)}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
