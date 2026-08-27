"""Request bodies.

`extra='forbid'` everywhere on purpose: a typo in a key is a 400, never a silent
no-op. Response shapes are built in `repository.py`; keeping both in one package
means generating `openapi.yaml` later is transcription, not archaeology.
"""
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from topology.labels import MAX_BULK_IDS
from topology.measures import Length, Volume, Weight

# Field factories rather than shared Field instances: a PATCH needs the same
# constraints with a default of None, and a FieldInfo is not safe to share.
def label_field(**kwargs):
    """[A-Za-z0-9_]{1,16} - '-' is the separator of the composed shelf path."""
    return Field(min_length=1, max_length=16, pattern=r'^[A-Za-z0-9_]+$', **kwargs)


def level_field(**kwargs):
    return Field(min_length=1, max_length=8, pattern=r'^[A-Za-z0-9_]+$', **kwargs)


def name_field(**kwargs):
    return Field(min_length=1, max_length=200, **kwargs)

# The composed path is not stored, so a per-request template has nothing to write
# to (D7 of the plan). The key is accepted, but only with this exact value.
CANONICAL_NAMING = '{zone}-{aisle}-{rack}-L{level}'

LabelSpec = Union[str, List[str]]


class TopologyModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

    def changes(self) -> Dict[str, Any]:
        """The fields the caller actually sent - the source of a dynamic PATCH."""
        return self.model_dump(exclude_unset=True)


class PatchModel(TopologyModel):
    @model_validator(mode='after')
    def _at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError('a PATCH body must set at least one field')
        return self


# --- location / warehouse -------------------------------------------------

class LocationCreate(TopologyModel):
    address: str = name_field()
    city: str = name_field()
    postal_code: str = Field(min_length=1, max_length=20)
    country: str = name_field()


class WarehouseCreate(TopologyModel):
    name: str = name_field()
    description: Optional[str] = None
    location_id: Optional[int] = Field(default=None, gt=0)
    location: Optional[LocationCreate] = None

    @model_validator(mode='after')
    def _exactly_one_location(self):
        if (self.location_id is None) == (self.location is None):
            raise ValueError("exactly one of 'location_id' or 'location' is required")
        return self


class WarehousePatch(PatchModel):
    name: Optional[str] = name_field(default=None)
    description: Optional[str] = None
    location_id: Optional[int] = Field(default=None, gt=0)


# --- zone -----------------------------------------------------------------

class ZoneCreate(TopologyModel):
    code: str = label_field()
    name: str = name_field()
    description: Optional[str] = None


class ZonePatch(PatchModel):
    code: Optional[str] = label_field(default=None)
    name: Optional[str] = name_field(default=None)
    description: Optional[str] = None


# --- aisle / rack / shelf -------------------------------------------------

class AisleCreate(TopologyModel):
    label: str = label_field()
    width: Length


class AislePatch(PatchModel):
    label: Optional[str] = label_field(default=None)
    width: Optional[Length] = None


class RackCreate(TopologyModel):
    label: str = label_field()
    max_height: Length


class RackPatch(PatchModel):
    label: Optional[str] = label_field(default=None)
    max_height: Optional[Length] = None


class ShelfCreate(TopologyModel):
    level: str = level_field()
    max_weight: Weight
    max_volume: Volume


class ShelfPatch(PatchModel):
    level: Optional[str] = level_field(default=None)
    max_weight: Optional[Weight] = None
    max_volume: Optional[Volume] = None


class ShelfBulkPatchBody(PatchModel):
    # `level` is deliberately absent: it is unique per rack, so setting the same
    # level on many shelves could only ever end in a unique violation.
    max_weight: Optional[Weight] = None
    max_volume: Optional[Volume] = None


class ShelfBulkPatch(TopologyModel):
    ids: List[int] = Field(min_length=1, max_length=MAX_BULK_IDS)
    patch: ShelfBulkPatchBody


# --- declarative writes ---------------------------------------------------

class ShelfTemplate(TopologyModel):
    per_rack: Optional[int] = Field(default=None, gt=0)
    levels: LabelSpec
    max_weight: Weight
    max_volume: Volume


class RackTemplate(TopologyModel):
    per_aisle: Optional[int] = Field(default=None, gt=0)
    labels: LabelSpec
    max_height: Length
    shelves: Optional[ShelfTemplate] = None


class AisleTemplate(TopologyModel):
    count: Optional[int] = Field(default=None, gt=0)
    labels: LabelSpec
    width: Length
    racks: Optional[RackTemplate] = None


class AisleGenerate(AisleTemplate):
    """POST /zones/{id}/aisles:generate - aisles, optionally with racks below."""


class RackGenerate(RackTemplate):
    """POST /aisles/{id}/racks:generate - racks, optionally with shelves below."""


class ShelfGenerate(ShelfTemplate):
    """POST /racks/{id}/shelves:generate."""


class LayoutZone(TopologyModel):
    code: str = label_field()
    name: str = name_field()
    description: Optional[str] = None
    aisles: Optional[AisleTemplate] = None
    racks: Optional[RackTemplate] = None
    shelves: Optional[ShelfTemplate] = None

    @model_validator(mode='after')
    def _children_need_parents(self):
        if self.racks is not None and self.aisles is None:
            raise ValueError("'racks' needs 'aisles' - there is nothing to hang them off")
        if self.shelves is not None and self.racks is None:
            raise ValueError("'shelves' needs 'racks' - there is nothing to hang them off")
        return self


class LayoutCreate(TopologyModel):
    naming: Optional[str] = None
    zones: List[LayoutZone] = Field(min_length=1)

    @model_validator(mode='after')
    def _naming_is_canonical(self):
        if self.naming is not None and self.naming != CANONICAL_NAMING:
            raise ValueError(
                f"'naming' is fixed at '{CANONICAL_NAMING}': the path is composed in the "
                'response and never stored, so a per-request template has nothing to write to'
            )
        return self
