/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

import {
  AddCargoInput,
  CargoLoadPlanReadModel,
  ChangeLoadSpaceInput,
  CreateLoadPlanInput,
  CreateLoadPlanResponse,
  WeightUnit,
} from "./data-contracts";

export namespace CargoPlans {
  /**
   * @description Creates a new cargo load plan for a given load space class – either a detachable trailer or a class of rigid vehicles.
   * @tags CargoPlans
   * @name CreateLoadPlan
   * @summary Create a load plan
   * @request POST:/cargo-plans
   * @response `201` `CreateLoadPlanResponse` Load plan created successfully
   * @response `400` `ErrorResponse` Missing or unknown loadSpaceType.
   * @response `500` `ErrorResponse`
   */
  export namespace CreateLoadPlan {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateLoadPlanInput;
    export type RequestHeaders = {};
    export type ResponseBody = CreateLoadPlanResponse;
  }

  /**
   * @description Returns the full state of a load plan including assigned cargo units.
   * @tags CargoPlans
   * @name GetLoadPlan
   * @summary Get load plan details
   * @request GET:/cargo-plans/{id}
   * @response `200` `CargoLoadPlanReadModel` Load plan found
   * @response `400` `ErrorResponse` Malformed load plan id or unsupported query parameter.
   * @response `404` `ErrorResponse` No load plan exists with the given ID.
   * @response `500` `ErrorResponse`
   */
  export namespace GetLoadPlan {
    export type RequestParams = {
      /**
       * UUID of the load plan
       * @format uuid
       * @example "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
       */
      id: string;
    };
    export type RequestQuery = {
      /** Unit in which weight values are expressed in the response. Defaults to KG. */
      weightUnit?: WeightUnit;
    };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = CargoLoadPlanReadModel;
  }

  /**
   * @description Adds a pallet unit with cargo to an existing draft load plan.
   * @tags CargoPlans
   * @name AddCargoToLoadPlan
   * @summary Add cargo to a load plan
   * @request POST:/cargo-plans/{id}/cargo
   * @response `204` `void` Cargo added successfully – no body returned.
   * @response `400` `ErrorResponse` Request payload does not match the contract (unknown pallet or cargo type, non-positive weight or height, malformed id).
   * @response `404` `ErrorResponse` No load plan exists with the given ID.
   * @response `409` `ErrorResponse` The plan cannot accept the cargo in its current state: it is already finalized, the cargo cannot be co-loaded with what is already on the plan, or a concurrent modification won the optimistic lock.
   * @response `422` `ErrorResponse` The payload is well-formed but violates a planning rule: load space weight capacity or vehicle payload exceeded, loading metres exceeded, cargo too tall or too wide, a capability the load space lacks, or a pallet that cannot carry this cargo type or weight.
   * @response `500` `ErrorResponse`
   */
  export namespace AddCargoToLoadPlan {
    export type RequestParams = {
      /**
       * UUID of the load plan
       * @format uuid
       * @example "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
       */
      id: string;
    };
    export type RequestQuery = {};
    export type RequestBody = AddCargoInput;
    export type RequestHeaders = {};
    export type ResponseBody = void;
  }

  /**
   * @description Removes a specific pallet unit from a draft load plan by its unit ID.
   * @tags CargoPlans
   * @name RemoveCargoFromLoadPlan
   * @summary Remove cargo from a load plan
   * @request DELETE:/cargo-plans/{id}/cargo/{unitId}
   * @response `204` `void` Cargo removed successfully – no body returned.
   * @response `400` `ErrorResponse` Malformed load plan or unit id.
   * @response `404` `ErrorResponse` No load plan exists with the given ID, or the plan carries no unit with that ID.
   * @response `409` `ErrorResponse` The plan is already finalized, or a concurrent modification won the optimistic lock.
   * @response `500` `ErrorResponse`
   */
  export namespace RemoveCargoFromLoadPlan {
    export type RequestParams = {
      /**
       * UUID of the load plan
       * @format uuid
       * @example "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
       */
      id: string;
      /**
       * UUID of the pallet unit to remove
       * @format uuid
       * @example "b2c3d4e5-f6a7-8901-bcde-f12345678901"
       */
      unitId: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = void;
  }

  /**
   * @description Replaces the load space class on a draft load plan. All currently assigned cargo units are re-validated against the new class's capabilities and capacity. Switching between a trailer and a rigid vehicle class is allowed and will additionally apply (or drop) the vehicle payload rule.
   * @tags CargoPlans
   * @name ChangeLoadSpace
   * @summary Change load space
   * @request PUT:/cargo-plans/{id}/load-space
   * @response `204` `void` Load space changed successfully – no body returned.
   * @response `400` `ErrorResponse` Missing or unknown loadSpaceType, or malformed load plan id.
   * @response `404` `ErrorResponse` No load plan exists with the given ID.
   * @response `409` `ErrorResponse` The plan is already finalized, the cargo on it cannot be co-loaded, or a concurrent modification won the optimistic lock.
   * @response `422` `ErrorResponse` Cargo already on the plan does not fit the new load space – its capacity, payload, loading metres, dimensions or capabilities are not enough for what is loaded.
   * @response `500` `ErrorResponse`
   */
  export namespace ChangeLoadSpace {
    export type RequestParams = {
      /**
       * UUID of the load plan
       * @format uuid
       * @example "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
       */
      id: string;
    };
    export type RequestQuery = {};
    export type RequestBody = ChangeLoadSpaceInput;
    export type RequestHeaders = {};
    export type ResponseBody = void;
  }

  /**
   * @description Marks the load plan as FINALIZED. A finalized plan cannot be modified. The plan must have at least one cargo unit and must not exceed load space capacity.
   * @tags CargoPlans
   * @name FinalizeLoadPlan
   * @summary Finalize a load plan
   * @request POST:/cargo-plans/{id}/finalize
   * @response `204` `void` Load plan finalized successfully – no body returned.
   * @response `400` `ErrorResponse` Malformed load plan id.
   * @response `404` `ErrorResponse` No load plan exists with the given ID.
   * @response `409` `ErrorResponse` The plan is already finalized, or a concurrent modification won the optimistic lock.
   * @response `422` `ErrorResponse` The plan cannot be finalized – it carries no cargo, or it exceeds the load space's loading metres.
   * @response `500` `ErrorResponse`
   */
  export namespace FinalizeLoadPlan {
    export type RequestParams = {
      /**
       * UUID of the load plan
       * @format uuid
       * @example "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
       */
      id: string;
    };
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = void;
  }
}
