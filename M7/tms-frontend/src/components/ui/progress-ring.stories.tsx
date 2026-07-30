import React from 'react';
import { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressRing, ProgressRingProps } from './progress-ring';

const meta: Meta<ProgressRingProps> = {
  title: 'UI/ProgressRing',
  component: ProgressRing,
  argTypes: {
    value: {
      control: 'text',
      description: 'Main value shown in the center of the ring',
    },
    unit: {
      control: 'text',
      description: 'Unit shown below the value, inside the ring',
    },
    percentage: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Progress percentage, 0-100',
    },
    label: {
      control: 'text',
      description: 'Label shown below the ring',
    },
    color: {
      control: 'color',
      description: 'Stroke color of the progress arc',
    },
    size: {
      control: { type: 'number', min: 40, max: 300, step: 10 },
      description: 'Diameter of the ring, in pixels',
    },
    strokeWidth: {
      control: { type: 'number', min: 2, max: 30, step: 1 },
      description: 'Thickness of the ring stroke',
    },
    trackColor: {
      control: 'color',
      description: 'Stroke color of the background track',
    },
  },
  args: {
    value: 420,
    unit: 'cal',
    percentage: 85,
    label: 'Move',
    color: '#fa114f',
    size: 120,
    strokeWidth: 10,
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<ProgressRingProps>;

export const Playground: Story = {
  render: (args) => <ProgressRing {...args} />,
};

export const Move: Story = {
  args: {
    value: 420,
    unit: 'cal',
    percentage: 85,
    label: 'Move',
    color: '#fa114f',
  },
};

export const Exercise: Story = {
  args: {
    value: 35,
    unit: 'min',
    percentage: 70,
    label: 'Exercise',
    color: '#a3e635',
  },
};

export const Stand: Story = {
  args: {
    value: 10,
    unit: 'hrs',
    percentage: 83,
    label: 'Stand',
    color: '#22d3ee',
  },
};

// Activity rings example — matches the reference "Move / Exercise / Stand" layout
export const ActivityRingsRow: Story = {
  name: 'Activity Rings Row',
  render: () => (
    <div className="flex gap-8 rounded-lg bg-slate-950 p-8">
      <ProgressRing value={420} unit="cal" percentage={85} label="Move" color="#fa114f" />
      <ProgressRing value={35} unit="min" percentage={70} label="Exercise" color="#a3e635" />
      <ProgressRing value={10} unit="hrs" percentage={83} label="Stand" color="#22d3ee" />
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};

export const Empty: Story = {
  args: {
    value: 0,
    unit: 'cal',
    percentage: 0,
    label: 'Move',
    color: '#fa114f',
  },
};

export const Complete: Story = {
  args: {
    value: 500,
    unit: 'cal',
    percentage: 100,
    label: 'Move',
    color: '#fa114f',
  },
};

export const CustomSize: Story = {
  args: {
    value: '98%',
    unit: undefined,
    percentage: 98,
    label: 'On-Time Rate',
    color: '#16a34a',
    size: 160,
    strokeWidth: 14,
  },
};
