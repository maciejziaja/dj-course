"""Measures on the boundary of the API.

The schema is not uniform, so neither is the handling (D4 of the plan):

* `aisle.width` and `rack.max_height` have a unit column, so a length is stored
  **verbatim** - the value and the unit the caller sent. The CHECK on the column
  guards the vocabulary.
* `shelf.max_weight` and `shelf.max_volume` have no unit column, so they are
  **normalised** on write - to kilograms and cubic metres - and always read back
  as `{"value": ..., "unit": "kg"|"m3"}`.

A bare number is accepted anywhere a measure is: it means "already in the base
unit", which is mm for lengths, kg for weights and m3 for volumes.
"""
from decimal import Decimal
from typing import Any, Dict, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

LengthUnit = Literal['mm', 'cm', 'm']
WeightUnit = Literal['g', 'kg', 't']
VolumeUnit = Literal['cm3', 'l', 'm3']

BASE_LENGTH_UNIT: LengthUnit = 'mm'
BASE_WEIGHT_UNIT: WeightUnit = 'kg'
BASE_VOLUME_UNIT: VolumeUnit = 'm3'

TO_KG = {'g': Decimal('0.001'), 'kg': Decimal(1), 't': Decimal(1000)}
TO_M3 = {'cm3': Decimal('0.000001'), 'l': Decimal('0.001'), 'm3': Decimal(1)}


class _BareNumberIsBaseUnit:
    """Mixin: `{"value": 800, "unit": "kg"}` and `800` mean the same thing."""

    @model_validator(mode='before')
    @classmethod
    def _accept_bare_number(cls, data: Any) -> Any:
        if isinstance(data, (int, float, str, Decimal)) and not isinstance(data, bool):
            return {'value': data}
        return data


class Length(_BareNumberIsBaseUnit, BaseModel):
    """A length stored verbatim, together with its unit."""
    model_config = ConfigDict(extra='forbid')

    value: int = Field(gt=0)
    unit: LengthUnit = BASE_LENGTH_UNIT


class Weight(_BareNumberIsBaseUnit, BaseModel):
    model_config = ConfigDict(extra='forbid')

    value: Decimal = Field(gt=0)
    unit: WeightUnit = BASE_WEIGHT_UNIT

    def to_kg(self) -> Decimal:
        return _trim(self.value * TO_KG[self.unit])


class Volume(_BareNumberIsBaseUnit, BaseModel):
    model_config = ConfigDict(extra='forbid')

    value: Decimal = Field(gt=0)
    unit: VolumeUnit = BASE_VOLUME_UNIT

    def to_m3(self) -> Decimal:
        return _trim(self.value * TO_M3[self.unit])


def _trim(value: Decimal) -> Decimal:
    """Drop the trailing zeros a conversion leaves behind (2.400 -> 2.4)."""
    normalised = value.normalize()
    # normalize() renders integers in exponent form (1E+3); undo that.
    return normalised.quantize(Decimal(1)) if normalised == normalised.to_integral_value() else normalised


def number(value: Union[Decimal, int, float, None]) -> Union[int, float, None]:
    """JSON-friendly number: an int when it is one, a float otherwise."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        value = _trim(value)
        return int(value) if value == value.to_integral_value() else float(value)
    return value


def measure_out(value: Union[Decimal, int, float, None], unit: str) -> Dict[str, Any]:
    return {'value': number(value), 'unit': unit}
