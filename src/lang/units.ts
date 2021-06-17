/**
 * This module is responsible for defining the Unit type and
 * utilities for working with its instances. A Unit is a value
 * consisting of a dimension and a numeric value.
 *
 * A dimension is simply a record mapping SI base units to their
 * respective exponents. For example, to create a Unit representing
 * 42 kg*m/s^2 you write:
 *
 * new Unit(42, {M: new Fraction(1), L: new Fraction(1), T: new Fraction(-2)});
 */

import Big from 'big.js';
import Fraction from 'fraction.js';

// https://en.wikipedia.org/wiki/SI_base_unit#Definitions
export const dimensionNames = ['T', 'L', 'M', 'I', 'Th', 'N', 'J'] as const;

// @ts-ignore
export const neutralDimension: Dimension = Object.fromEntries(dimensionNames.map(k => [k, new Fraction(0)]))

export type DimensionName = (typeof dimensionNames)[any];
export type Dimension = Readonly<Record<DimensionName, Fraction>>

export type UnitSource = [Unit] | [Big | number] | [Big | number, Partial<Dimension>];

export const makeUnit = (...src: UnitSource): Unit =>
  (src[0] instanceof Unit) ? src[0] : new Unit(src[0], src[1]);

export const dimEq = (d1: Dimension, d2: Dimension): boolean =>
  dimensionNames.every(name => d1[name].equals(d2[name]));

export const populateDim = (dim: Partial<Dimension>): Dimension => {
  const newDim: any = {};
  for (const name of dimensionNames)
    newDim[name] = dim[name] || new Fraction(0);
  return newDim;
}

export const renderDim = (dim: Dimension): string => {
  const pos: [string, string][] = [];
  const neg: [string, string][] = [];
  for (const [name, frac] of Object.entries(dim)) {
    if (frac.compare(0) < 0)
      neg.push([name, frac.neg().toFraction()]);
    if (frac.compare(0) > 0)
      pos.push([name, frac.toFraction()]);
  }

  const posStr = pos.map(([name, frac]) => frac === '1' ? name : `${name}^${frac}`).join(' ');
  const negStr = neg.map(([name, frac]) => frac === '1' ? name : `${name}^${frac}`).join(' ');

  if (posStr && negStr)
    return `${posStr} / ${negStr}`;
  else if (posStr)
    return posStr;
  else if (negStr)
    return `1 / ${negStr}`;
  else
    return '1';
}


class Unit {
  public readonly value: Big;
  public readonly dim: Dimension;

  constructor (value: Big | number, dim: Partial<Dimension> = neutralDimension) {
    this.value = new Big(value);
    this.dim = populateDim(dim);
  }

  public equals(...other: UnitSource): boolean {
    const unit = makeUnit(...other);
    return dimEq(this.dim, unit.dim) && this.value.eq(unit.value);
  }

  public add (...other: UnitSource): Unit | null {
    const unit = makeUnit(...other);

    if (!dimEq(this.dim, unit.dim))
      return null;

    return new Unit(this.value.add(unit.value), this.dim);
  }

  public sub (...other: UnitSource): Unit | null {
    const unit = makeUnit(...other);

    if (!dimEq(this.dim, unit.dim))
      return null;

    return new Unit(this.value.sub(unit.value), this.dim);
  }

  public mul (...other: UnitSource): Unit {
    const unit = makeUnit(...other);

    const newDim: any = {};
    for (const name of dimensionNames)
      newDim[name] = this.dim[name].add(unit.dim[name]);
    return new Unit(this.value.mul(unit.value), newDim);
  }

  public pow (...other: UnitSource): Unit | null {
    const unit = makeUnit(...other);

    if ( this.value.lt(0)
      || this.value.eq(0) && unit.value.eq(0)
      || !dimEq(unit.dim, neutralDimension)
      || !unit.value.round().eq(unit.value))
      return null;

    const newDim: any = {}
    for (const name of dimensionNames)
      newDim[name] = this.dim[name].mul(unit.value.toNumber())

    return new Unit(this.value.pow(unit.value.toNumber()), newDim);
  }

  public root (...other: UnitSource): Unit | null {
    const unit = makeUnit(...other);

    if ( unit.value.eq(0)
      || !dimEq(unit.dim, neutralDimension)
      || !unit.value.round().eq(unit.value)
      || this.value.lt(0) && unit.value.toNumber() % 2 !== 0)
      return null;

    const newDim: any = {}
    for (const name of dimensionNames)
      newDim[name] = this.dim[name].div(unit.value.toNumber())

    return new Unit(Math.pow(this.value.toNumber(), (1 / unit.value.toNumber())), newDim);
  }

  public div (...other: UnitSource): Unit | null {
    const unit = makeUnit(...other);

    const newDim: any = {};
    if (unit.value.eq(0))
      return null;

    for (const name of dimensionNames)
      newDim[name] = this.dim[name].sub(unit.dim[name]);
    return new Unit(this.value.div(unit.value), newDim);
  }

  public toString (): string {
    if (dimEq(this.dim, neutralDimension))
      return this.value.toString();
    else
      return '(' + this.value.toString() + ' [' + renderDim(this.dim) + ']' + ')';
  }
}

export type { Unit };